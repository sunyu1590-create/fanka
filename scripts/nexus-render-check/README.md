# Nexus 三维渲染验收夹具

仅用于本地渲染验收，不参与生产构建，也不会被页面引用。

- `entry.ts`：用一份**显式标注为测试**的固定快照驱动真实 `NexusEngine`，逐场景出图；
  其中的数值只用于驱动渲染，不代表任何线上业务数据。
- `shot.mjs`：Playwright + Firefox（需要 WebGL2；沙箱内用 `xvfb-run` 提供 llvmpipe）。

```bash
# 1) 打包夹具
npx esbuild scripts/nexus-render-check/entry.ts --bundle --format=esm \
  --target=es2020 --outfile=/tmp/nexus-shot/bundle.js
# 2) 准备 index.html 指向 bundle.js，起静态服务
python3 -m http.server 8765 --directory /tmp/nexus-shot
# 3) 出图（Firefox 需要 X 环境）
xvfb-run -a --server-args="-screen 0 1600x1000x24" node scripts/nexus-render-check/shot.mjs
```

截图输出到 `/workspace/nexus-2.0-shots/`。
