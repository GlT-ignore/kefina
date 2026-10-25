FROM python:3.12-slim AS api
COPY --from=ghcr.io/astral-sh/uv:0.11.18 /uv /bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ backend/
COPY data/ data/

FROM api AS opening-view
COPY scripts/ scripts/
RUN .venv/bin/python -m scripts.export_web_data /prerender-data.json

FROM node:24.21.0-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
COPY --from=opening-view /prerender-data.json ./prerender-data.json
RUN npm run build

FROM api
COPY --from=web /web/dist web/dist
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", ".venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
