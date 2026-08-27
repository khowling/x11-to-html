FROM x11-web-base:latest

RUN apt-get update && apt-get install -y \
    x11-apps \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY start-x11-application /usr/local/bin/start-x11-application
RUN chmod +x /usr/local/bin/start-x11-application
