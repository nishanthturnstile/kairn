FROM postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       postgresql-17-postgis-3=3.7.0+dfsg-1.pgdg12+2 \
       postgresql-17-postgis-3-scripts=3.7.0+dfsg-1.pgdg12+2 \
       postgresql-17-pgvector=0.8.7-1.pgdg12+2 \
       pgbackrest=2.60.1-1.pgdg12+1 \
    && rm -rf /var/lib/apt/lists/*
