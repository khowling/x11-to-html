FROM ubuntu:22.04

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Shared private Xvnc base. Application images add their own X11 client.
RUN apt-get update && apt-get install -y \
    tigervnc-standalone-server \
    tigervnc-common \
    xfonts-base \
    xfonts-75dpi \
    xfonts-100dpi \
    x11-utils \
    supervisor \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create vnc user
RUN useradd -m -s /bin/bash vnc

USER vnc
WORKDIR /home/vnc

RUN mkdir -p ~/.vnc

# Switch back to root for supervisor setup
USER root

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/supervisord.conf

# Copy startup scripts
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# VNC remains on the private Docker network.
EXPOSE 5901

# Set environment variables
ENV DISPLAY=:1
ENV VNC_RESOLUTION=1024x768
ENV VNC_DEPTH=24
ENV VNC_PORT=5901


# Start supervisor
CMD ["/usr/local/bin/docker-entrypoint.sh"]