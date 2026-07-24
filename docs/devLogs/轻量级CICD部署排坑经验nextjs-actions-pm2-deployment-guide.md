# Next.js + PM2 + GitHub Actions 极轻量“零常驻”自动化部署实战指南

在本项目（`docex`）的部署实践中，我们成功摒弃了传统的、极其消耗服务器内存的 **Self-hosted Runner** 方案，改用**业界首推的轻量级 CI/CD 架构**：
**利用 GitHub 提供的免费算力进行高强度的“编译打包（CI）”，通过 SSH 安全隧道将极致压缩的独立包（Standalone）分发至阿里云 ECS，并利用 PM2 守护进程进行零停机热重载（CD）。**

此方案让云服务器的常驻内存开销直接**暴降数百兆**，且彻底规避了 Next.js 本地编译导致服务器 OOM（内存溢出）宕机的风险。

以下是我们在本次部署中“过五关斩六将”踩坑摸索出的完整经验总结，供后续项目一键套用。

---

## ⚙️ 核心架构原理图

```
[ 本地推流 ] ──(git push)──> [ GitHub 仓库 ]
                                   │
                         (触发 GitHub Actions)
                                   ▼
                    [ GitHub 托管运行器 (Ubuntu-latest) ]
                     ├─ 1. pnpm install & next build (Standalone 编译)
                     ├─ 2. 整合静态资源与 PM2 配置
                     └─ 3. 打包压缩为 release.tar.gz
                                   │
                     (通过高位安全端口 29922 SCP 传输)
                                   ▼
                            [ 阿里云 ECS ]
                     ├─ 1. 解压 release.tar.gz 至 /var/www/docex
                     └─ 2. 执行 pm2 reload ecosystem.config.cjs (无缝更新)
```

---

## 🛑 避坑历险记（六大经典踩坑点与终极解法）

### 坑点一：云服务器 SSH 22 端口超时（`i/o timeout`）
* **问题现象**：GitHub Actions 在 `Copy Files to Server` 步骤直接卡死，最终报错 `dial tcp ***:22: i/o timeout`。
* **原因分析**：阿里云 ECS 等云厂商出于安全考虑，强烈不建议对公网开放默认的 `22` 端口，安全组或防火墙拦截了外部请求。
* **终极解法（双端口策略）**：
  在保持原有 22 端口（作为后路）的同时，启用高位冷门端口 `29922` 作为 CI/CD 专用通道：
  1. 修改 `/etc/ssh/sshd_config`，加入：
     ```text
     Port 22
     Port 29922
     ```
  2. **新版 Ubuntu 的隐藏坑**：重启 `ssh` 服务未生效。因为新版系统启用了 `socket activation`。
     必须运行以下命令强制重载套接字激活器：
     ```bash
     sudo systemctl daemon-reload
     sudo systemctl restart ssh.socket
     ```
  3. 阿里云安全组入方向放行 `29922` 端口。

---

### 坑点二：SSH 手试能过，Actions 却报错（`unable to authenticate`）
* **问题现象**：本地连接测试成功，但 Actions 连接时提示：`ssh: unable to authenticate, attempted methods [none publickey]`。
* **原因分析**：Linux 系统对 `.ssh` 目录及认证文件的权限有着极度苛刻的安全审查。
* **终极解法**：
  1. 确保将公钥成功追加到了认证文件中：`cat id_rsa.pub >> authorized_keys`。
  2. 严格执行“安全权限三板斧”锁死权限：
     ```bash
     chmod 700 /home/zpje/.ssh
     chmod 600 /home/zpje/.ssh/authorized_keys
     chown -R zpje:zpje /home/zpje/.ssh
     ```

---

### 坑点三：部署路径写入权限不足（`Permission denied`）
* **问题现象**：`Copy Files` 步骤报错 `create folder /var/www/docex: Process exited with status 1`。
* **原因分析**：`/var/www` 默认属于 `root` 用户。而 GitHub Actions 是用普通用户 `zpje` 登录的，无权在其中建文件夹。
* **终极解法**：
  在服务器端执行权限交接：
  ```bash
  sudo mkdir -p /var/www/docex
  sudo chown -R zpje:zpje /var/www/docex
  sudo chmod 755 /var/www/docex
  ```

---

### 坑点四：打包时遗漏 PM2 配置文件（`ecosystem.config.js not found`）
* **问题现象**：服务器端解压成功，但 PM2 启动时报错 `File ecosystem.config.js not found`。
* **原因分析**：Next.js 的 Standalone 编译产物输出在 `.next/standalone` 目录中。我们直接进入该目录打包，从而遗漏了放在项目根目录下的 `ecosystem.config.js`。
* **终极解法**：
  在 Actions 工作流打包前，显式将根目录下的 PM2 配置文件复制进 `standalone` 目录：
  ```yaml
  cp ecosystem.config.cjs .next/standalone/ecosystem.config.cjs
  ```

---

### 坑点五：Node 模块规范冲突（`module is not defined`）
* **问题现象**：PM2 报错 `ReferenceError: module is not defined in ES module scope`。
* **原因分析**：Next.js 项目的 `package.json` 包含了 `"type": "module"`，导致 Node.js 将所有 `.js` 文件按 ES Module 解析。而传统的 PM2 配置文件使用了 CommonJS 规范的 `module.exports`。
* **终极解法**：
  将 PM2 配置文件重命名为 **`ecosystem.config.cjs`**。`.cjs` 后缀会强制 Node.js 以 CommonJS 规范解析，完美消除规范冲突。

---

### 坑点六：PM2 启动脚本相对路径错位（`Script not found`）
* **问题现象**：PM2 报错 `Script not found: /var/www/docex/.next/standalone/server.js`。
* **原因分析**：
  我们在 Actions 中对 `.next/standalone` 目录内部进行了打包（`cd .next/standalone && tar -czf release.tar.gz .`）。
  因此在服务器上解压后，`server.js` 会直接位于 `/var/www/docex/server.js`，而不是内部的嵌套路径。
* **终极解法**：
  在 `ecosystem.config.cjs` 中，将 `script` 路径修正为当前目录的相对路径：
  ```javascript
  script: "./server.js"
  ```

---

## 📝 最终生产就绪配置文件模版

### 1. `ecosystem.config.cjs` (PM2 配置)
存放于项目根目录下：
```javascript
module.exports = {
  apps: [
    {
      name: "docex",
      script: "./server.js", // 指向当前目录解压出的 server.js
      env: {
        PORT: 4003,            // 项目绑定的生产端口
        NODE_ENV: "production" // 生产环境变量
      }
    }
  ]
};
```

### 2. `.github/workflows/deploy.yml` (GitHub Actions 工作流)
存放于项目 `.github/workflows/` 目录下：
```yaml
name: Deploy docex to Server

on:
  push:
    branches:
      - main # 仅在 main 分支推送时触发部署

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      # 1. 拉取最新的代码
      - name: Checkout Code
        uses: actions/checkout@v4

      # 2. 设置 Node.js 环境
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      # 3. 安装 pnpm 工具
      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9

      # 4. 配置 pnpm 依赖缓存，极大提升后续构建速度
      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Cache pnpm dependencies
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      # 5. 安装依赖并执行 Next.js 生产环境打包
      - name: Install & Build
        run: |
          pnpm install --frozen-lockfile
          pnpm build

      # 6. 提取 Standalone 独立运行包、整合静态资源和 PM2 配置，并极致压缩
      - name: Package Artifacts
        run: |
          [ -d public ] && cp -r public .next/standalone/public || echo "No public folder found"
          cp -r .next/static .next/standalone/.next/static
          cp ecosystem.config.cjs .next/standalone/ecosystem.config.cjs
          cd .next/standalone
          tar -czf ../../release.tar.gz .

      # 7. 通过高位安全端口 29922 将压缩包安全地传输到服务器指定目录
      - name: Copy Files to Server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_KEY }}
          port: 29922
          source: "release.tar.gz"
          target: "/var/www/docex"

      # 8. SSH 登录服务器执行解压，并让 PM2 执行平滑的热重载（零停机时间更新）
      - name: Deploy and Restart via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_KEY }}
          port: 29922
          script: |
            cd /var/www/docex
            tar -xzf release.tar.gz --overwrite
            rm release.tar.gz
            pm2 reload ecosystem.config.cjs || pm2 start ecosystem.config.cjs
```

---

## 🏆 方案落地的最终收益

1. **服务器常驻内存净省 100MB+ / 每项目**：移除自建 Runner，服务器上除了项目本身，没有任何额外的 CI/CD 引擎常驻。
2. **服务器 CPU 零编译波动**：哪怕 Next.js 项目再复杂，云服务器在更新部署时也只是瞬时解压、无缝重载，CPU 占用率始终保持极低且平稳。
3. **零停机平滑更新（Zero-Downtime）**：得益于 `pm2 reload`，用户在部署期间访问页面不会遇到任何服务中断或 502 错误。
