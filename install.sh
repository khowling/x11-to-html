#!/bin/bash

# TigerVNC + noVNC Setup Script
# This script sets up a complete web-based X11 display solution

set -e

echo "Installing TigerVNC + noVNC Setup..."

# Update package list
sudo apt-get update

# Install required packages
echo "Installing TigerVNC server..."
sudo apt-get install -y tigervnc-standalone-server tigervnc-common

echo "Installing noVNC and websockify..."
sudo apt-get install -y novnc python3-websockify

# Install additional X11 utilities
sudo apt-get install -y xfonts-base xfonts-75dpi xfonts-100dpi

echo "Creating VNC password..."
# Create VNC password directory
mkdir -p ~/.vnc

# Set VNC password (you'll be prompted)
echo "Please set a VNC password:"
vncpasswd

echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Run './start-server.sh' to start the VNC server"
echo "2. Open http://localhost:6080/vnc.html in your browser"
echo "3. Use the VNC password you just set to connect"