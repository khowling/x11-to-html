FROM ubuntu:22.04

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages
RUN apt-get update && apt-get install -y \
    tigervnc-standalone-server \
    tigervnc-common \
    novnc \
    python3-websockify \
    xfonts-base \
    xfonts-75dpi \
    xfonts-100dpi \
    x11-apps \
    x11-utils \
    xterm \
    fluxbox \
    supervisor \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create vnc user
RUN useradd -m -s /bin/bash vnc

# Set up VNC password
USER vnc
WORKDIR /home/vnc

# Create VNC password (default: "vncpass")
RUN mkdir -p ~/.vnc && \
    echo "vncpass" | vncpasswd -f > ~/.vnc/passwd && \
    chmod 600 ~/.vnc/passwd

# Create VNC startup script
RUN echo '#!/bin/bash' > ~/.vnc/xstartup && \
    echo 'export XKL_XMODMAP_DISABLE=1' >> ~/.vnc/xstartup && \
    echo 'unset SESSION_MANAGER' >> ~/.vnc/xstartup && \
    echo 'unset DBUS_SESSION_BUS_ADDRESS' >> ~/.vnc/xstartup && \
    echo 'fluxbox &' >> ~/.vnc/xstartup && \
    chmod +x ~/.vnc/xstartup

# Switch back to root for supervisor setup
USER root

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/supervisord.conf

# Copy startup scripts
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose ports
EXPOSE 5901 6080

# Set environment variables
ENV DISPLAY=:1
ENV VNC_RESOLUTION=1024x768
ENV VNC_DEPTH=24
ENV VNC_PORT=5901
ENV WEB_PORT=6080

# Start supervisor
CMD ["/usr/local/bin/docker-entrypoint.sh"]