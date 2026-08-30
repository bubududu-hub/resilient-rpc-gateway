.PHONY: install check build demo benchmark

install:
	npm ci

check:
	npm run check

build:
	npm run build

demo:
	docker compose up --build

benchmark:
	npm run benchmark
