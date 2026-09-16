# Atlas Mind desktop: lightweight XFCE + ungoogled Chromium behind VNC.
# One container per owner; `atlas-display N` boots Xvnc :N with its own Xfce
# session, Chromium profile, and websockify bridge (one screen per Mind).
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# ungoogled-chromium Debian repo (OBS). Pinned key; if the repo ever moves,
# swap these two lines for plain `chromium` — everything else is unchanged.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg \
 && mkdir -p /etc/apt/keyrings \
 && curl -fsSL https://download.opensuse.org/repositories/home:/ungoogled_chromium/Debian_Bookworm/Release.key \
      | gpg --dearmor -o /etc/apt/keyrings/ungoogled-chromium.gpg \
 && echo "deb [signed-by=/etc/apt/keyrings/ungoogled-chromium.gpg] http://download.opensuse.org/repositories/home:/ungoogled_chromium/Debian_Bookworm/ ./" \
      > /etc/apt/sources.list.d/ungoogled-chromium.list \
 && apt-get update && apt-get install -y --no-install-recommends \
      xfce4 \
      xfce4-terminal \
      thunar \
      mousepad \
      xfce4-screenshooter \
      tigervnc-standalone-server \
      tigervnc-common \
      novnc \
      websockify \
      ungoogled-chromium \
      xdotool \
      scrot \
      dbus-x11 \
      fonts-dejavu \
      fonts-noto-color-emoji \
      adwaita-icon-theme \
 && rm -rf /var/lib/apt/lists/*

# 1280x800: the geometry the Mind's coordinates assume (desktop_click
# clamps to it; screenshots come back at it).
ENV ATLAS_GEOM=1280x800

COPY atlas-display /usr/local/bin/atlas-display
RUN chmod +x /usr/local/bin/atlas-display

# Homes persist on the bind mount (/home/desktop/{owner} layout is arranged
# by the server); nothing here writes outside /home/desktop and /tmp.
VOLUME /home/desktop

# Idle: every display is booted on demand by `atlas-display`, so a fresh
# container just sleeps until the first screen is requested.
CMD ["sleep", "infinity"]
