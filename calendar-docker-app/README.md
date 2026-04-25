# Mountain Calendar Docker App

一个开箱即用的山景玻璃拟态日历 WebUI。它不是静态演示：日程会通过内置 API 写入 `/data/events.json`，配合 Docker volume 后容器重启仍会保留。

## 启动

```bash
docker compose up --build
```

打开：

```text
http://localhost:8080
```

## 功能

- WebUI：山景背景、玻璃拟态、日/周/月视图、搜索、AI 助手弹窗、Hans Zimmer 专注音乐建议
- 日程管理：创建、编辑、删除、查看详情
- 持久化：默认保存到容器内 `/data/events.json`
- API：`GET /api/events`、`POST /api/events`、`PUT /api/events/:id`、`DELETE /api/events/:id`
- 健康检查：`GET /api/health`

## 数据备份

Compose 默认使用命名卷 `mountain-calendar-data`。如果想把数据挂到当前目录，可以把 `docker-compose.yml` 里的 volume 改成：

```yaml
volumes:
  - ./data:/data
```

## 本地开发

```bash
npm test
npm start
```

本地启动后访问：

```text
http://localhost:8080
```
