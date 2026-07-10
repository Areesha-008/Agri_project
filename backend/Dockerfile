FROM python:3.12-slim

WORKDIR /app

# WeasyPrint (production report PDFs) needs Pango/Cairo/GDK-Pixbuf at
# runtime, not just at pip-install time — these are native libs, not
# Python packages. Mirrors the Homebrew `pango`/`gdk-pixbuf` install used
# in local dev (see DEPLOY.md).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p static/ndvi_images static/scan_images

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
