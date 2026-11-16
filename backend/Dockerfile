# Enersync API image.
# The Python version is a build argument, so it can change in one place (docker-compose.yml or here).
ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# The API runs as an ordinary user, not as root
RUN useradd --create-home --uid 10001 appuser

# Install the libraries first. Docker reuses this step until requirements.txt changes,
# so rebuilding after a code change is fast.
COPY requirements.txt .
# Remove the invisible marker that Windows PowerShell can put at the start of the file
RUN sed -i '1s/^\xEF\xBB\xBF//' requirements.txt && pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

USER appuser
EXPOSE 8000

# 0.0.0.0 means "accept connections from outside the container". Without it the API would be unreachable.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
