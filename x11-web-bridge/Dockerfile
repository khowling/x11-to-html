FROM ubuntu:22.04

# Avoid interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages
RUN apt-get update && apt-get install -y \
    tigervnc-standalone-server \
    tigervnc-common \
    xfonts-base \
    xfonts-75dpi \
    xfonts-100dpi \
    x11-apps \
    x11-utils \
    xterm \
    fluxbox \
    supervisor \
    openssh-server \
    xdotool \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create vnc user
RUN useradd -m -s /bin/bash vnc

USER vnc
WORKDIR /home/vnc

RUN mkdir -p ~/.vnc

# Create VNC startup script for external X clients
RUN echo '#!/bin/bash' > ~/.vnc/xstartup && \
    echo 'export XKL_XMODMAP_DISABLE=1' >> ~/.vnc/xstartup && \
    echo 'unset SESSION_MANAGER' >> ~/.vnc/xstartup && \
    echo 'unset DBUS_SESSION_BUS_ADDRESS' >> ~/.vnc/xstartup && \
    echo 'xsetroot -solid grey' >> ~/.vnc/xstartup && \
    echo '# X clients will connect from host machine' >> ~/.vnc/xstartup && \
    echo 'while true; do sleep 1; done' >> ~/.vnc/xstartup && \
    chmod +x ~/.vnc/xstartup

# Switch back to root for supervisor setup
USER root

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisor/supervisord.conf

# Copy startup scripts
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose service ports. VNC remains on the private Docker network.
EXPOSE 22 5901

# Set environment variables
ENV DISPLAY=:1
ENV VNC_RESOLUTION=1024x768
ENV VNC_DEPTH=24
ENV VNC_PORT=5901


# Start supervisor
CMD ["/usr/local/bin/docker-entrypoint.sh"]