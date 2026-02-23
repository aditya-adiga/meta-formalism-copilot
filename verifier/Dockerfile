FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -s /bin/bash lean
USER lean
WORKDIR /home/lean

# Install elan (Lean version manager), toolchain, and warm up Lake in one layer
# so the PATH update from elan's installer is visible to subsequent commands
COPY --chown=lean:lean lean-project/ /home/lean/lean-project/
RUN curl https://elan.lean-lang.org/install.sh -sSf | bash -s -- --default-toolchain none -y \
    && export PATH="/home/lean/.elan/bin:${PATH}" \
    && elan toolchain install $(cat /home/lean/lean-project/lean-toolchain) \
    && cd /home/lean/lean-project && lake build

ENV PATH="/home/lean/.elan/bin:${PATH}"

# Copy server code
WORKDIR /home/lean/verifier
COPY --chown=lean:lean package.json package-lock.json* tsconfig.json server.ts ./

# Install dependencies and compile
RUN npm install && npx tsc

EXPOSE 3100

CMD ["node", "dist/server.js"]
