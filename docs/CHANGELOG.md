# Changelog

## [1.2.0](https://github.com/albertomh/UptimeWorker/compare/1.1.0...1.2.0) (2026-09-03)


### Features

* Opentofu module for deployment to Cloudflare ([#24](https://github.com/albertomh/UptimeWorker/issues/24)) ([1058e55](https://github.com/albertomh/UptimeWorker/commit/1058e553311853f660402ceb4e5f0b0c6fba04c5))


### Bug Fixes

* Define custom status subdomain, not just worker route ([#29](https://github.com/albertomh/UptimeWorker/issues/29)) ([9d6deec](https://github.com/albertomh/UptimeWorker/commit/9d6deec64a72aeb707682baf0ce033f4c0e8b7a5))
* Explicitly disable D1 read replication ([#28](https://github.com/albertomh/UptimeWorker/issues/28)) ([42dc5c6](https://github.com/albertomh/UptimeWorker/commit/42dc5c6b67a9bfc524ae58afa10bc144479c9403))
* Pass Cloudflare token to schema bootstrap ([#27](https://github.com/albertomh/UptimeWorker/issues/27)) ([ec04079](https://github.com/albertomh/UptimeWorker/commit/ec04079cafb93251d09445159c19defdae6bdd09))
* Use scheduled controller time for cron checks ([#32](https://github.com/albertomh/UptimeWorker/issues/32)) ([b045d88](https://github.com/albertomh/UptimeWorker/commit/b045d88eb03efa086568b05427dd489bfdfdf08d))

## [1.1.0](https://github.com/albertomh/UptimeWorker/compare/uptime-worker-1.0.0...uptime-worker-1.1.0) (2026-09-01)


### Features

* Geofence requests to the dashboard by country ([#19](https://github.com/albertomh/UptimeWorker/issues/19)) ([d4d67e8](https://github.com/albertomh/UptimeWorker/commit/d4d67e875dc7a5fc411515736e74e5d5d3fbca01))
* Send email alerts on first run and state transitions ([#17](https://github.com/albertomh/UptimeWorker/issues/17)) ([1245516](https://github.com/albertomh/UptimeWorker/commit/12455161e79c718f9ae3a7bf0e16feac2e6c044e))


### Bug Fixes

* Escape rendered status fields ([#23](https://github.com/albertomh/UptimeWorker/issues/23)) ([9a4c3f4](https://github.com/albertomh/UptimeWorker/commit/9a4c3f48871ce116f7fc4df3addcbd94f2f2f9af))
* Isolate alert state by target ([#22](https://github.com/albertomh/UptimeWorker/issues/22)) ([a9cec6d](https://github.com/albertomh/UptimeWorker/commit/a9cec6ddb08198b47e211985dd6bb8263c028077))

## 1.0.0 (2026-08-30)


### Features

* Add a graph of latency over the last 12 hours ([#13](https://github.com/albertomh/UptimeWorker/issues/13)) ([0285a3b](https://github.com/albertomh/UptimeWorker/commit/0285a3b4bbd17c7f38852b581af8eac05bca3a03))
* Add database schema & wire into worker ([#5](https://github.com/albertomh/UptimeWorker/issues/5)) ([d771f78](https://github.com/albertomh/UptimeWorker/commit/d771f78384f43d8e55f42940a3cab4091513efc8))
* Add minimal TypeScript Cloudflare Worker ([#4](https://github.com/albertomh/UptimeWorker/issues/4)) ([8b96350](https://github.com/albertomh/UptimeWorker/commit/8b96350e11e64a54de235af6d925c8f773cbabc5))
* Clean up old entries as part of scheduled run ([#11](https://github.com/albertomh/UptimeWorker/issues/11)) ([47c9934](https://github.com/albertomh/UptimeWorker/commit/47c99341c7cc11664411c1c3368dafc3f75cf80b))
* Cron schedule for health checks, save results in D1 ([#10](https://github.com/albertomh/UptimeWorker/issues/10)) ([65fed47](https://github.com/albertomh/UptimeWorker/commit/65fed47b728d88488eebf39bdf46a93481882556))
* Flesh out healthcheck db table ([#9](https://github.com/albertomh/UptimeWorker/issues/9)) ([9b52128](https://github.com/albertomh/UptimeWorker/commit/9b52128d9e8b34bc68c034683995d4783c3d101a))
* Status dashboard with uptime summary, history, stale env alerts ([#12](https://github.com/albertomh/UptimeWorker/issues/12)) ([b2471a7](https://github.com/albertomh/UptimeWorker/commit/b2471a7944051a04818524669bed23711e1ba573))


### Bug Fixes

* **ci:** Use release-please step output for PR branch ref ([#14](https://github.com/albertomh/UptimeWorker/issues/14)) ([4dcffe8](https://github.com/albertomh/UptimeWorker/commit/4dcffe8d2d8e1b0df229d9c2524f80809bce9332))
* Humanise time since 'last change' ([#16](https://github.com/albertomh/UptimeWorker/issues/16)) ([d1b0420](https://github.com/albertomh/UptimeWorker/commit/d1b04202d6e36f0b3fcffb53929723dfdd0bbcd8))
