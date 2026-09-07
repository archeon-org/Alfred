# Generated from langgraph.json with `langgraph dockerfile`.
# Regenerate this file whenever the LangGraph deployment config changes.
FROM langchain/langgraph-api:3.12-wolfi@sha256:cca6a56c9499cf9cff880cf40a3032c22e38b2998260cf3aaa1a6b9aaf37b7bf

# Add the local agent package declared by `dependencies: ["."]`.
ADD . /deps/agent

# Install local dependencies under the Agent Server constraints.
RUN for dep in /deps/*; do \
      echo "Installing $dep"; \
      if [ -d "$dep" ]; then \
        (cd "$dep" && PYTHONDONTWRITEBYTECODE=1 uv pip install --system --no-cache-dir -c /api/constraints.txt -e .); \
      fi; \
    done

ENV LANGSERVE_GRAPHS='{"orchestrator": "/deps/agent/src/alfred_agent/graph.py:graph"}'

# Restore the platform-owned packages in case an application dependency shadows them.
RUN mkdir -p /api/langgraph_api /api/langgraph_runtime /api/langgraph_license \
    && touch /api/langgraph_api/__init__.py /api/langgraph_runtime/__init__.py /api/langgraph_license/__init__.py \
    && PYTHONDONTWRITEBYTECODE=1 uv pip install --system --no-cache-dir --no-deps -e /api

# Remove build tooling from the runtime image.
RUN pip uninstall -y pip setuptools wheel \
    && rm -rf /usr/local/lib/python*/site-packages/pip* \
      /usr/local/lib/python*/site-packages/setuptools* \
      /usr/local/lib/python*/site-packages/wheel* \
      /usr/lib/python*/site-packages/pip* \
      /usr/lib/python*/site-packages/setuptools* \
      /usr/lib/python*/site-packages/wheel* \
    && for bindir in /usr/local/bin /usr/bin; do \
      if [ -d "$bindir" ]; then find "$bindir" -name "pip*" -delete; fi; \
    done \
    && rm -f /usr/bin/uv /usr/bin/uvx

WORKDIR /deps/agent

RUN addgroup -g 10001 -S alfred \
    && adduser -u 10001 -S -D -H -G alfred alfred

ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1

USER 10001:10001
