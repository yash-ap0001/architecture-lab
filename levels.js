/* Architecture Lab levels. Each level is a short story with a traffic profile, a goal (SLO) and optional failures.
 * Numbers are learning numbers (see lab-engine.js), chosen so a good answer exists and the obvious answer is not enough.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabLevels = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const ALL = ["cdn", "limiter", "lb", "app", "auto", "cache", "coalesce", "queue", "replicas", "shards", "ha", "salting"];
  const L = (o) => Object.assign({ chaos: [], allowed: ALL }, o);

  return [
    L({
      id: 1, title: "Hello, world", lesson: "01-interview-framework",
      story: "Your side project has 150 visitors a minute at peak. It is a blog: mostly reads. Keep it alive and cheap.",
      learn: "Do not over-build. Every box you add costs money and adds something that can break.",
      load: { base: 120, shape: "steady", readFrac: 0.95, staticFrac: 0.3 },
      slo: { p95: 120, avail: 99, budget: 500 },
      allowed: ["app", "lb", "cache"],
      ref: {"cdn": false, "limiter": 0, "lb": "none", "app": {"n": 1, "auto": false}, "cache": {"tier": "none", "nodes": 2, "coalesce": false}, "queue": {"on": false, "workers": 24}, "db": {"shards": 1, "replicas": 0, "ha": false, "salting": false}},
    }),
    L({
      id: 2, title: "Launch day", lesson: "04-load-balancing-cdn",
      story: "A newsletter mention sends 3,000 requests per second at the peak. One server cannot cope.",
      learn: "Stateless app servers scale sideways, but clients need a load balancer to spread traffic across them.",
      load: { base: 3000, shape: "ramp", readFrac: 0.9 },
      slo: { p95: 150, avail: 99, budget: 1300 },
      allowed: ["lb", "app", "auto", "cache"],
      ref: {"cdn": false, "limiter": 0, "lb": "single", "app": {"n": 3, "auto": true}, "cache": {"tier": "s", "nodes": 1, "coalesce": false}, "queue": {"on": false, "workers": 8}, "db": {"shards": 1, "replicas": 0, "ha": false, "salting": false}},
    }),
    L({
      id: 3, title: "The read wall", lesson: "05-caching",
      story: "A news site: 96 of every 100 requests read the same popular stories. The app scales fine, yet the database is melting.",
      learn: "Caching removes work. Put the fastest storage in front of the slowest and watch database load fall.",
      load: { base: 12000, shape: "diurnal", readFrac: 0.96 },
      slo: { p95: 80, avail: 99.5, budget: 4700 },
      allowed: ["lb", "app", "auto", "cache", "replicas"],
      ref: {"cdn": false, "limiter": 0, "lb": "single", "app": {"n": 40, "auto": false}, "cache": {"tier": "l", "nodes": 1, "coalesce": false}, "queue": {"on": false, "workers": 2}, "db": {"shards": 1, "replicas": 0, "ha": false, "salting": false}},
    }),
    L({
      id: 4, title: "Gone viral", lesson: "15-scaling-patterns",
      story: "A post takes off: traffic jumps 5x for half an hour, and 60% of requests are images and scripts.",
      learn: "Absorb spikes at the edge. A CDN removes static load, and autoscaling covers the rest, but it reacts slowly.",
      load: { base: 4000, shape: "spike", spikeX: 5, readFrac: 0.95, staticFrac: 0.6 },
      slo: { p95: 120, avail: 99, budget: 3800 },
      allowed: ["cdn", "lb", "app", "auto", "cache", "replicas"],
      ref: {"cdn": true, "limiter": 0, "lb": "single", "app": {"n": 30, "auto": false}, "cache": {"tier": "m", "nodes": 1, "coalesce": false}, "queue": {"on": false, "workers": 8}, "db": {"shards": 1, "replicas": 0, "ha": false, "salting": false}},
    }),
    L({
      id: 5, title: "The write wall", lesson: "09-messaging-streaming",
      story: "An analytics product receives 5,000 events per second, mostly writes, with bursts. A single database primary takes about 1,000 writes a second.",
      learn: "Queues smooth bursts and decouple speed of arrival from speed of storage. Shards multiply write capacity.",
      load: { base: 5000, shape: "spike", spikeX: 2, readFrac: 0.1 },
      slo: { p95: 100, avail: 99, budget: 7500, maxDelay: 5 },
      allowed: ["lb", "app", "auto", "queue", "shards", "replicas"],
      ref: {"cdn": false, "limiter": 0, "lb": "single", "app": {"n": 30, "auto": false}, "cache": {"tier": "none", "nodes": 1, "coalesce": false}, "queue": {"on": true, "workers": 24}, "db": {"shards": 8, "replicas": 0, "ha": false, "salting": false}},
    }),
    L({
      id: 6, title: "Never lose the primary", lesson: "07-replication-sharding",
      story: "A billing service. At minute 50 the database primary dies. Users must keep reading, and the system must recover fast.",
      learn: "Replicas keep reads alive; high-availability failover restores writes in seconds instead of leaving you down.",
      load: { base: 3000, shape: "steady", readFrac: 0.7 },
      chaos: [{ tick: 50, type: "dbDown", duration: 1 }],
      slo: { p95: 120, avail: 99.5, budget: 1900 },
      allowed: ["lb", "app", "cache", "queue", "replicas", "ha"],
      ref: {"cdn": false, "limiter": 0, "lb": "single", "app": {"n": 10, "auto": false}, "cache": {"tier": "m", "nodes": 1, "coalesce": false}, "queue": {"on": true, "workers": 2}, "db": {"shards": 1, "replicas": 0, "ha": true, "salting": false}},
    }),
    L({
      id: 7, title: "Cold cache", lesson: "05-caching",
      story: "A deploy flushes the cache during peak. Every request now goes to the database at once (a thundering herd).",
      learn: "A cache protects the database only while it is warm. Coalesce duplicate misses and keep spare database capacity.",
      load: { base: 14000, shape: "steady", readFrac: 0.95 },
      chaos: [{ tick: 60, type: "cacheFlush", duration: 1, severity: 0.7 }],
      slo: { p95: 150, avail: 99, budget: 6500 },
      allowed: ["lb", "app", "cache", "coalesce", "replicas"],
      ref: {"cdn": false, "limiter": 0, "lb": "single", "app": {"n": 50, "auto": false}, "cache": {"tier": "l", "nodes": 1, "coalesce": true}, "queue": {"on": false, "workers": 4}, "db": {"shards": 1, "replicas": 3, "ha": false, "salting": false}},
    }),
    L({
      id: 8, title: "The celebrity", lesson: "07-replication-sharding",
      story: "One account has 30 million followers. Sharding by user puts that account's traffic on a single shard, so one shard is hot while others idle.",
      learn: "Sharding only helps if load spreads evenly. Hot keys need salting or caching in front.",
      load: { base: 4500, shape: "steady", readFrac: 0.5, skew: 3 },
      slo: { p95: 120, avail: 99, budget: 2700, maxDelay: 5 },
      allowed: ["lb", "app", "cache", "shards", "salting", "queue", "replicas"],
      ref: {"cdn": false, "limiter": 0, "lb": "single", "app": {"n": 15, "auto": false}, "cache": {"tier": "none", "nodes": 3, "coalesce": false}, "queue": {"on": false, "workers": 16}, "db": {"shards": 3, "replicas": 0, "ha": false, "salting": true}},
    }),
    L({
      id: 9, title: "Black Friday", lesson: "13-reliability-observability",
      story: "Peak shopping. 25,000 requests per second, half of them static, 10% bots. Mid-peak an availability zone goes dark. Money is tight.",
      learn: "Combine everything, but only what pays for itself: limit bots, offload static, redundancy for the outage.",
      load: { base: 25000, shape: "spike", spikeX: 1.6, readFrac: 0.85, staticFrac: 0.5, botFrac: 0.12 },
      chaos: [{ tick: 55, type: "azOut", duration: 25 }],
      slo: { p95: 120, avail: 99.5, budget: 9100 },
      allowed: ALL,
      ref: {"cdn": true, "limiter": 48000, "lb": "ha", "app": {"n": 40, "auto": true}, "cache": {"tier": "s", "nodes": 1, "coalesce": true}, "queue": {"on": false, "workers": 8}, "db": {"shards": 4, "replicas": 0, "ha": true, "salting": true}},
    }),
    L({
      id: 10, title: "Pro exam: the URL shortener", lesson: "15-scaling-patterns",
      story: "100 million redirects a day (peak 6,000 per second, 99% reads, hot links). Two incidents: a cache flush and then a database failure. Reply in under 60 ms, at 99.95% availability, for $9,700 a month.",
      learn: "This is the interview problem. Cache hot links, keep writes durable, plan for both incidents, and keep the bill down.",
      load: { base: 14000, shape: "diurnal", readFrac: 0.99, skew: 2 },
      chaos: [{ tick: 40, type: "cacheFlush", duration: 1 }, { tick: 85, type: "dbDown", duration: 1 }],
      slo: { p95: 60, avail: 99.95, budget: 9700 },
      allowed: ALL,
      ref: {"cdn": false, "limiter": 0, "lb": "ha", "app": {"n": 60, "auto": false}, "cache": {"tier": "none", "nodes": 4, "coalesce": true}, "queue": {"on": true, "workers": 2}, "db": {"shards": 3, "replicas": 3, "ha": false, "salting": true}},
    }),
  ];
});
