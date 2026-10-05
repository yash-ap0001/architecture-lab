/* 91 more example designs for the Sandbox (with the 9 originals: 100). Compact text specs, laid out automatically.
 * Node: "id:type key=value flag"   Edge chain: "a>b>c"   parallel call: "a~b"   modifiers after the target: [r] reads only, [w] writes only, [s] static only, [f] failover only
 * A value of ? is sized by tools/size_examples.js so the design meets its own goals. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabExamples = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const sc = (base, readPct, shape, x) => Object.assign({ base, shape: shape || "steady", readFrac: readPct / 100 }, x || {});
  const slo = (p95, avail, budget) => ({ p95, avail, budget });
  const L = []; // [category, name, notice, scenario, slo, nodes, edges]
  const ex = (cat, name, notice, scenario, goals, nodes, edges) => L.push({ cat, name, notice, scenario, slo: goals, nodes, edges });

  // ------------------------------------------------------------------ Web and content
  ex("Web & content", "Personal blog", "Small traffic: one server, a cache and a CDN is plenty. Do not over-build.", sc(40, 98, "spike", { spikeX: 3, staticFrac: 0.5 }), slo(300, 99, 800),
    "c:browser; cdn:cdn; a:app inst=1; d:mysql", "c>cdn>a>d");
  ex("Web & content", "Documentation site", "Static files behind a CDN: your servers hardly see any traffic.", sc(800, 100, "diurnal", { staticFrac: 0.9 }), slo(150, 99.5, 900),
    "c:browser; cdn:cloudflare; o:object; a:app inst=1", "c>cdn>a, cdn>o[s]");
  ex("Web & content", "Wiki (Wikipedia style)", "Read heavy with a huge cache hit rate; edits are rare but must be durable.", sc(9000, 99.5, "diurnal", { staticFrac: 0.4 }), slo(200, 99.9, 12000),
    "c:browser; cdn:cdn; lb:lb ha; a:app inst=12 auto; k:cache inst=3 hit=0.95; d:mysql replicas=3 ha", "c>cdn>lb>a>k>d, a>d");
  ex("Web & content", "E-commerce storefront", "Browsing is cached; checkout hits the database and the payment provider.", sc(2500, 85, "spike", { spikeX: 3, staticFrac: 0.3 }), slo(300, 99.9, 9000),
    "c:browser; cdn:cdn; lb:lb ha; a:java inst=14 auto retries=1 breaker; k:cache inst=2 hit=0.85; d:postgres replicas=2 ha; p:payment ratio=0.1 inst=4; s:search-db shards=4", "c>cdn>lb>a>k>d, a>d, a>p, a~s");
  ex("Web & content", "Marketplace (Etsy style)", "Search, listings and orders each want a different store.", sc(3000, 90, "diurnal", { staticFrac: 0.35 }), slo(350, 99.9, 14000),
    "c:browser; cdn:cdn; lb:lb ha; a:node inst=4 auto; k:cache inst=2 hit=0.85; d:postgres replicas=2 ha; s:elasticsearch replicas=1; q:queue workers=1; n:notify inst=1", "c>cdn>lb>a>k>d, a>d, a~s, a>q>n");
  ex("Web & content", "SaaS app (multi-tenant)", "Steady business-hours traffic; one database for all tenants is fine until it is not.", sc(700, 80, "diurnal"), slo(250, 99.9, 6000),
    "c:browser; lb:lb ha; a:springboot inst=1 auto; k:cache inst=2 hit=0.8; d:postgres replicas=1 ha; w:celery inst=1; q:sqs", "c>lb>a>k>d, a>d, a>q>w>d");
  ex("Web & content", "Online forum", "Popular threads are hot keys: cache them and the database rests.", sc(1800, 95, "diurnal", { skew: 2.5 }), slo(250, 99.5, 6000),
    "c:browser; cdn:cdn; a:django inst=6 auto; k:cache inst=2 hit=0.9; d:postgres replicas=2", "c>cdn>a>k>d, a>d");
  ex("Web & content", "Classified ads", "Search heavy: a dedicated search index keeps the main database light.", sc(1500, 96, "diurnal"), slo(250, 99.5, 7000),
    "c:browser; cdn:cdn; a:rails inst=7 auto; s:meilisearch replicas=1; d:mysql replicas=1; o:object", "c>cdn>a>d, a~s, a>o");
  ex("Web & content", "Landing page with sign-up", "A traffic spike from an ad campaign: the queue absorbs the sign-ups.", sc(300, 40, "spike", { spikeX: 12, staticFrac: 0.5 }), slo(300, 99.5, 3000),
    "c:browser; cdn:cloudflare; a:node inst=7 auto; q:sqs; w:worker inst=5; d:postgres; e:email ratio=0.3", "c>cdn>a>q>w>d, w>e");
  ex("Web & content", "Job board (like this lab's)", "Crawlers in, candidates out: writes come in bursts through a queue.", sc(900, 80, "diurnal", { botFrac: 0.2 }), slo(300, 99.5, 5000),
    "c:browser; w:waf; a:go inst=1 auto; q:kafka workers=1; d:postgres replicas=1 ha; s:search-db replicas=1", "c>w>a>q>d, a~s");

  // ------------------------------------------------------------------ Social and real time
  ex("Social & real time", "Chat app (WhatsApp style)", "Millions of open connections: the WebSocket tier, not the database, is the limit.", sc(20000, 40, "diurnal"), slo(150, 99.9, 60000),
    "c:mobile; lb:nlb; ws:wsgateway inst=2 auto; a:elixir inst=12 auto; k:redis-cluster inst=4 hit=0.9; q:kafka workers=8; d:cassandra shards=2", "c>lb>ws>a>k>d, a>q>d");
  ex("Social & real time", "Social feed (Twitter style)", "Reading feeds is far more common than posting: precompute timelines in cache.", sc(15000, 97, "spike", { spikeX: 2, skew: 2.5 }), slo(200, 99.9, 60000),
    "c:mobile; cdn:cdn; gw:apigw inst=3; a:java inst=74 auto; k:redis-cluster inst=6 hit=0.92; d:cassandra shards=1; q:kafka workers=1; w:worker inst=4", "c>cdn>gw>a>k>d, a>d, a>q>w>k");
  ex("Social & real time", "Push notification service", "Fan-out through a queue so a slow provider never blocks the sender.", sc(2500, 5, "spike", { spikeX: 4 }), slo(400, 99.5, 8000),
    "c:client; a:go inst=16 auto retries=1 breaker; q:pubsub workers=12; n:notify inst=19 auto; p:pushnotif ratio=0.7 inst=4; d:dynamo", "c>a>q>n>p, a>d");
  ex("Social & real time", "Live comments", "Bursts during a live event; fan-out to many viewers.", sc(6000, 60, "spike", { spikeX: 5 }), slo(200, 99.5, 15000),
    "c:browser; ws:wsgateway inst=5 auto; a:node inst=96 auto; k:redis-cluster inst=3 hit=0.9; q:redisstreams workers=5; d:mongo shards=7", "c>ws>a>k>d, a>q>d");
  ex("Social & real time", "Multiplayer game backend", "Latency matters most: state lives in memory and is flushed to a database behind.", sc(8000, 50, "diurnal"), slo(80, 99.5, 30000),
    "c:client; lb:nlb; g:rustsvc inst=5 auto; k:dragonfly inst=3 hit=0.95; q:nats2 workers=1; d:scylla shards=1", "c>lb>g>k>d, g>q>d");
  ex("Social & real time", "Ride tracking (Uber style)", "Driver locations are a constant stream of writes; matching reads them.", sc(12000, 30, "diurnal"), slo(200, 99.9, 50000),
    "c:mobile; gw:apigw; a:go inst=11 auto; q:kinesis workers=8; k:redis-cluster inst=4 hit=0.9; d:cassandra shards=2; m:maps ratio=0.1 inst=6", "c>gw>a>k>d, a>q>d, a>m");
  ex("Social & real time", "Collaborative document editor", "Many small writes per user; ordering and conflict handling live in the app tier.", sc(4000, 50, "diurnal"), slo(150, 99.9, 20000),
    "c:browser; lb:lb ha; ws:wsgateway inst=1 auto; a:node inst=8 auto; k:cache inst=3 hit=0.9; d:postgres shards=3 replicas=1 ha; o:object", "c>lb>ws>a>k>d, a>d, a>o");
  ex("Social & real time", "Dating app matching", "Candidate lookup is search plus ranking; photos come from the CDN.", sc(3500, 85, "diurnal", { staticFrac: 0.4 }), slo(250, 99.5, 15000),
    "c:mobile; cdn:cdn; gw:apigw; a:kotlin inst=4 auto; k:cache inst=3 hit=0.85; d:postgres replicas=2 ha; s:elasticsearch replicas=1; o:object", "c>cdn>gw>a>k>d, a>d, a~s, a>o");

  // ------------------------------------------------------------------ Data and analytics
  ex("Data & analytics", "Clickstream pipeline", "Write-only ingestion: buffer in a stream, process in batches.", sc(20000, 0, "diurnal"), slo(300, 99, 40000),
    "c:browser; gw:apigw inst=2; a:go inst=19 auto; q:kafka workers=18; f:flink inst=96; w:clickhouse shards=6", "c>gw>a>q>f>w");
  ex("Data & analytics", "Log pipeline", "Logs are bursty and can be lost a little; never let them slow the app.", sc(10000, 0, "spike", { spikeX: 3 }), slo(500, 98, 32000),
    "c:client; a:go inst=48; q:kinesis workers=26; e:elasticsearch shards=54; o:object", "c>a>q>e, q>o");
  ex("Data & analytics", "IoT telemetry", "Millions of devices, small writes, mostly time-series queries.", sc(15000, 5, "steady"), slo(300, 99.5, 30000),
    "c:client; gw:apigw; a:go inst=24 auto; q:eventhubs workers=12; t:timescale shards=3; s:cache inst=2 hit=0.8", "c>gw>a>q>t, a>s");
  ex("Data & analytics", "Real-time analytics dashboard", "Fresh data and fast aggregates: an OLAP store instead of the main database.", sc(1200, 95, "diurnal"), slo(300, 99.5, 12000),
    "c:browser; a:node inst=3 auto; k:cache inst=2 hit=0.7; w:clickhouse2 replicas=1; q:kafka workers=1; s:kafkastreams inst=1", "c>a>k>w, q>s>w");
  ex("Data & analytics", "Data lake", "Cheap object storage in the middle; query engines on top.", sc(200, 95, "steady"), slo(10000, 99, 8000),
    "c:browser; a:python inst=1; t:athena; o:object; q:kinesis workers=1; e:worker inst=1", "c>a>t, q>e>o");
  ex("Data & analytics", "Nightly ETL with Airflow", "Batch work is spiky and CPU heavy; it must not share a database with users.", sc(80, 30, "steady"), slo(1500, 99, 9000),
    "c:client; a:app inst=1; af:airflow inst=1; s:spark inst=1; w:warehouse; d:postgres", "c>a>d, af>s>w, s>d");
  ex("Data & analytics", "Change data capture", "Copy every database change to search and cache through a stream.", sc(1500, 60, "diurnal"), slo(250, 99.5, 12000),
    "c:browser; a:app inst=4 auto; d:postgres replicas=1 ha; q:kafka workers=1; s:elasticsearch replicas=1; k:cache inst=2", "c>a>d, a>k, a>q>s");
  ex("Data & analytics", "Metrics platform", "Many small writes plus dashboards; keep hot data on fast storage.", sc(6000, 10, "steady"), slo(400, 99, 20000),
    "c:client; a:go inst=10 auto; q:kafka workers=5; i:influx shards=1; g:grafana; m:prometheus", "c>a>q>i");
  ex("Data & analytics", "Batch recommendations", "Compute offline, serve precomputed results from a fast store.", sc(2500, 99, "diurnal"), slo(120, 99.5, 15000),
    "c:browser; cdn:cdn; a:python inst=9 auto; k:redis-cluster inst=3 hit=0.9; d:dynamo; sp:spark inst=1; w:warehouse", "c>cdn>a>k>d, sp>w, sp>d");
  ex("Data & analytics", "A/B testing platform", "Every request asks which variant to show: it must be very fast and always available.", sc(9000, 90, "diurnal"), slo(60, 99.95, 25000),
    "c:browser; lb:lb ha; a:go inst=9 auto; k:cache inst=3 hit=0.98; d:dynamo; q:kafka workers=1; w:clickhouse shards=1", "c>lb>a>k>d, a>q>w");

  // ------------------------------------------------------------------ AI
  ex("AI", "RAG chatbot on AWS Bedrock", "The LLM call dominates latency and cost; vector search runs in parallel.", sc(80, 100, "diurnal"), slo(4000, 99, 15000),
    "c:browser; gw:apigw-aws; a:lambda inst=1 auto; v:pgvector; m:bedrock inst=1; k:cache inst=1 hit=0.3", "c>gw>a>m, a~v, a>k");
  ex("AI", "Self-hosted LLM with vLLM", "GPUs are the whole bill. Batching and caching decide how many users fit.", sc(40, 100, "steady"), slo(5000, 99, 25000),
    "c:browser; gw:llmgw; a:fastapi inst=1; m:vllm inst=1; k:cache inst=1 hit=0.25", "c>gw>a>m, a>k");
  ex("AI", "Image generation queue", "Generation is slow: accept the request, queue it, tell the user when it is done.", sc(30, 20, "spike", { spikeX: 4 }), slo(1500, 99, 20000),
    "c:browser; a:node inst=1; q:sqs; g:mlserver inst=2; o:object; d:dynamo", "c>a>q>g>o, a>d");
  ex("AI", "Embedding ingestion", "Bulk documents in, vectors out: throughput matters more than latency.", sc(200, 10, "steady"), slo(3000, 98, 10000),
    "c:client; a:python inst=1; q:kafka workers=1; e:embed inst=3; v:qdrant shards=1; o:object", "c>a>q>e>v, a>o");
  ex("AI", "Semantic search", "Vector search for meaning plus keyword search for exact matches, run together.", sc(1200, 100, "diurnal"), slo(300, 99.5, 16000),
    "c:browser; a:go inst=1 auto; e:embed inst=15; v:weaviate replicas=1; s:elasticsearch replicas=1; k:cache inst=2 hit=0.4", "c>a>k, a~e, a~v, a~s");
  ex("AI", "Voice assistant", "Speech to text, an LLM and text to speech in a row: every step adds latency.", sc(60, 100, "diurnal"), slo(3500, 99, 20000),
    "c:mobile; gw:apigw; a:python inst=1; e:embed inst=1; m:llm inst=6; t:sagemaker inst=3", "c>gw>a>e>m>t");
  ex("AI", "AI agent with tools", "One request triggers many model and tool calls: retries can multiply the load.", sc(25, 100, "steady"), slo(9000, 98, 15000),
    "c:browser; a:fastapi inst=1 retries=1 breaker; m:openai ratio=3 inst=5; t:thirdparty ratio=2 inst=1; v:pgvector; d:postgres", "c>a>d, a>m, a>t, a~v");
  ex("AI", "ML inference platform", "Requests are batched onto GPUs; the feature store is on the hot path.", sc(900, 100, "diurnal"), slo(150, 99.9, 30000),
    "c:client; gw:envoy; a:go inst=1 auto; f:featurestore; m:mlserver inst=1; k:cache inst=2 hit=0.5", "c>gw>a>f, a>m, a>k");
  ex("AI", "Fraud scoring", "A tight latency budget on every payment; the model must never be the outage.", sc(1800, 90, "diurnal"), slo(350, 99.95, 30000),
    "c:client; gw:apigw; a:java inst=3 auto retries=1 breaker fallback; f:featurestore; m:mlserver inst=43; d:postgres replicas=1 ha", "c>gw>a>f, a>m, a>d");
  ex("AI", "Online recommendations", "Candidates from the vector store, ranked by a model, features from a store.", sc(3500, 100, "diurnal"), slo(150, 99.5, 30000),
    "c:browser; cdn:cdn; a:go inst=4 auto; v:milvus shards=1; m:mlserver inst=1; f:featurestore; k:redis-cluster inst=3 hit=0.85", "c>cdn>a>k, a>v, a>m, a~f");

  // ------------------------------------------------------------------ AWS
  ex("AWS", "AWS three-tier web app", "The classic: ALB, EC2 Auto Scaling group, RDS with a replica, ElastiCache.", sc(2000, 85, "diurnal"), slo(250, 99.9, 9000),
    "c:browser; r:route53; lb:alb ha; a:ec2 inst=5 auto; k:elasticache inst=2 hit=0.85; d:rds replicas=1 ha", "c>r>lb>a>k>d, a>d");
  ex("AWS", "AWS serverless API", "API Gateway, Lambda and DynamoDB: no servers, pay per request, watch cold starts.", sc(700, 80, "spike", { spikeX: 4 }), slo(250, 99.9, 4000),
    "c:mobile; gw:apigw-aws; a:lambda inst=4 auto; d:dynamodb-aws; k:cache inst=1 hit=0.6", "c>gw>a>k>d, a>d");
  ex("AWS", "AWS static site", "S3 and CloudFront: nothing to run, nothing to patch.", sc(1500, 100, "diurnal", { staticFrac: 1 }), slo(120, 99.9, 500),
    "c:browser; r:route53; cf:cloudfront; o:s3", "c>r>cf>o");
  ex("AWS", "AWS event-driven orders", "SNS fans out to queues; each consumer scales on its own.", sc(600, 40, "spike", { spikeX: 3 }), slo(300, 99.9, 6000),
    "c:browser; gw:apigw-aws; a:lambda inst=3 auto; t:sns; q1:sqs-aws workers=1; w1:lambda inst=1; d:dynamodb-aws; e:email ratio=0.2", "c>gw>a>t>q1>w1>d, w1>e");
  ex("AWS", "AWS containers on ECS Fargate", "Containers without servers, behind an ALB with a WAF.", sc(1800, 85, "diurnal"), slo(250, 99.9, 9000),
    "c:browser; w:waf-aws; lb:alb ha; a:fargate inst=5 auto; d:aurora replicas=2 ha; k:elasticache inst=2 hit=0.85", "c>w>lb>a>k>d, a>d");
  ex("AWS", "AWS on EKS", "Pods on a node group: pods only run if they fit on the nodes.", sc(5000, 85, "diurnal"), slo(250, 99.9, 30000),
    "c:browser; lb:alb ha; a:k8sdeploy inst=16 auto; np:eks nodes=4 auto max=40 multiAz; d:aurora replicas=2 ha; k:elasticache inst=2 hit=0.85", "c>lb>a>k>d, a>d, np>a");
  ex("AWS", "AWS data lake", "Kinesis in, S3 in the middle, Athena to query.", sc(8000, 10, "steady"), slo(2500, 99, 20000),
    "c:client; gw:apigw-aws; a:lambda inst=12 auto; q:kinesis workers=8; s:s3 inst=2; t:athena shards=58", "c>gw>a>q>s, a~t");
  ex("AWS", "AWS image resize pipeline", "Upload to S3, queue the work, resize with Lambda.", sc(150, 20, "spike", { spikeX: 6 }), slo(1500, 99, 3000),
    "c:browser; a:lambda inst=2 auto; s:s3; q:sqs-aws workers=1; w:lambda inst=1; d:dynamodb-aws", "c>a>s, a>q>w>s, w>d");
  ex("AWS", "AWS IoT ingestion", "Devices write time-series data through Kinesis into Timestream.", sc(9000, 5, "steady"), slo(400, 99.5, 15000),
    "c:client; gw:apigw-aws; a:lambda inst=13 auto; q:kinesis workers=8; t:timestream", "c>gw>a>q>t");
  ex("AWS", "AWS login with Cognito", "Sign-in is on the critical path of every session.", sc(500, 70, "diurnal"), slo(300, 99.9, 5000),
    "c:mobile; gw:apigw-aws; co:cognito inst=1; a:lambda inst=1 auto; d:dynamodb-aws", "c>gw>co, gw>a>d");
  ex("AWS", "AWS multi-AZ high availability", "Databases with a standby and servers in three zones survive a zone outage.", sc(3000, 85, "diurnal"), slo(250, 99.99, 20000),
    "c:browser; r:route53; lb:alb ha; a:asg nodes=19 auto multiAz; s:ec2 inst=11 auto; d:aurora replicas=2 ha; k:elasticache inst=3 hit=0.85", "c>r>lb>s>k>d, s>d, a>s");
  ex("AWS", "AWS cost-optimised", "The cheapest design that still meets the goals: serverless plus cache.", sc(200, 90, "diurnal"), slo(300, 99.5, 1500),
    "c:browser; cf:cloudfront; gw:apigw-aws; a:lambda inst=1 auto; d:dynamodb-aws; k:cache inst=1 hit=0.8", "c>cf>gw>a>k>d, a>d");

  // ------------------------------------------------------------------ Google Cloud
  ex("Google Cloud", "GCP web app on Cloud Run", "Containers that scale to zero, behind Google's global load balancer.", sc(1800, 85, "diurnal"), slo(250, 99.9, 7000),
    "c:browser; lb:cloudlb; a:cloudrun inst=2 auto; k:memorystore inst=2 hit=0.85; d:cloudsql replicas=1 ha", "c>lb>a>k>d, a>d");
  ex("Google Cloud", "GCP serverless API", "Cloud Functions with Firestore; simple and cheap at low volume.", sc(600, 75, "spike", { spikeX: 4 }), slo(300, 99.9, 3500),
    "c:mobile; gw:apigee; a:gcf inst=4 auto; d:firestore; k:cache inst=1 hit=0.6", "c>gw>a>k>d, a>d");
  ex("Google Cloud", "GCP on GKE", "Pods scheduled onto a node pool with autoscaling.", sc(5000, 85, "diurnal"), slo(250, 99.9, 30000),
    "c:browser; lb:cloudlb; a:k8sdeploy inst=16 auto; np:gke nodes=4 auto max=40 multiAz; d:alloydb replicas=2 ha; k:memorystore inst=2 hit=0.85", "c>lb>a>k>d, a>d, np>a");
  ex("Google Cloud", "GCP analytics on BigQuery", "Pub/Sub in, Dataflow to transform, BigQuery to query.", sc(6000, 20, "steady"), slo(1500, 99, 20000),
    "c:client; gw:apigee; a:cloudrun inst=11 auto; q:gcppubsub workers=3; f:dataflow inst=22; w:bigquery", "c>gw>a>q>f>w");
  ex("Google Cloud", "GCP global app on Spanner", "One strongly consistent database across regions, at a price.", sc(5000, 80, "diurnal"), slo(200, 99.99, 50000),
    "c:browser; lb:cloudlb; a:cloudrun inst=6 auto; d:spanner shards=1 replicas=2 ha", "c>lb>a>d");
  ex("Google Cloud", "GCP RAG on Vertex AI", "Gemini for answers, a vector store for context, Cloud Run in front.", sc(90, 100, "diurnal"), slo(4000, 99, 12000),
    "c:browser; a:cloudrun inst=1 auto; g:gemini inst=1; v:pgvector; k:cache inst=1 hit=0.3", "c>a>g, a~v, a>k");
  ex("Google Cloud", "GCP event-driven with Pub/Sub", "Publish once, many subscribers, each scales alone.", sc(800, 40, "spike", { spikeX: 3 }), slo(300, 99.9, 6000),
    "c:browser; a:cloudrun inst=5 auto; t:gcppubsub workers=1; w:gcf inst=2; d:firestore; e:email ratio=0.2", "c>a>t>w>d, w>e");
  ex("Google Cloud", "GCP static site", "Cloud Storage behind Cloud CDN.", sc(1200, 100, "diurnal", { staticFrac: 1 }), slo(120, 99.9, 400),
    "c:browser; d:clouddns; cdn:cloudcdn; o:gcs", "c>d>cdn>o");
  ex("Google Cloud", "GCP task processing", "Cloud Tasks throttle slow work sent to Cloud Run workers.", sc(300, 30, "spike", { spikeX: 5 }), slo(500, 99, 4000),
    "c:browser; a:cloudrun inst=3 auto; t:cloudtasks workers=1; w:cloudrun inst=1; d:cloudsql; p:thirdparty ratio=0.4 inst=2", "c>a>t>w>d, w>p");

  // ------------------------------------------------------------------ Azure
  ex("Azure", "Azure web app", "App Service, Azure SQL and Redis: the common enterprise shape.", sc(1800, 85, "diurnal"), slo(250, 99.9, 8000),
    "c:browser; fd:frontdoor; a:appservice inst=4 auto; k:azredis inst=2 hit=0.85; d:azuresql replicas=1 ha", "c>fd>a>k>d, a>d");
  ex("Azure", "Azure serverless API", "Functions and Cosmos DB with API Management.", sc(600, 75, "spike", { spikeX: 4 }), slo(300, 99.9, 4000),
    "c:mobile; gw:apim; a:azfunctions inst=4 auto; d:cosmos; k:cache inst=1 hit=0.6", "c>gw>a>k>d, a>d");
  ex("Azure", "Azure on AKS", "Pods on an AKS node pool spread across zones.", sc(5000, 85, "diurnal"), slo(250, 99.9, 30000),
    "c:browser; lb:appgw ha; a:k8sdeploy inst=16 auto; np:aks nodes=4 auto max=40 multiAz; d:azpostgres replicas=2 ha; k:azredis inst=2 hit=0.85", "c>lb>a>k>d, a>d, np>a");
  ex("Azure", "Azure event-driven with Service Bus", "Queue between the API and the workers keeps spikes away from the database.", sc(700, 35, "spike", { spikeX: 4 }), slo(300, 99.9, 7000),
    "c:browser; a:appservice inst=10 auto; q:servicebus workers=1; w:azfunctions inst=1; d:azuresql; e:email ratio=0.2", "c>a>q>w>d, w>e");
  ex("Azure", "Azure OpenAI chatbot", "Azure OpenAI for answers; the Azure database holds context.", sc(70, 100, "diurnal"), slo(4000, 99, 14000),
    "c:browser; a:appservice inst=1; m:azopenai inst=1; v:pgvector; k:cache inst=1 hit=0.3", "c>a>m, a~v, a>k");
  ex("Azure", "Azure IoT and analytics", "Event Hubs into Synapse for analysis.", sc(7000, 5, "steady"), slo(500, 99.5, 20000),
    "c:client; gw:apim; a:azfunctions inst=10 auto; q:eventhubs workers=5; w:synapse shards=5", "c>gw>a>q>w");
  ex("Azure", "Azure static website", "Blob storage behind Front Door.", sc(1200, 100, "diurnal", { staticFrac: 1 }), slo(120, 99.9, 400),
    "c:browser; fd:frontdoor; o:blob", "c>fd>o");
  ex("Azure", "Azure global multi-region", "Traffic Manager and Cosmos DB replicate across regions.", sc(3000, 85, "diurnal"), slo(250, 99.99, 40000),
    "c:browser; tm:trafficmanager; a:appservice inst=7 auto; d:cosmos shards=1 replicas=2", "c>tm>a>d");
  ex("Azure", "Azure DevOps to AKS delivery", "Pipeline, registry and cluster with monitoring watching the release.", sc(2500, 85, "diurnal"), slo(250, 99.9, 20000),
    "c:browser; lb:appgw ha; a:k8sdeploy inst=6 auto deploy=canary; np:aks nodes=2 auto max=30; d:azuresql replicas=1; ci:azdevops; r:acr; m:azmonitor", "c>lb>a>d, np>a");

  // ------------------------------------------------------------------ Docker and Kubernetes
  ex("Docker & Kubernetes", "Docker on one host", "Everything on one machine: simple, but the machine is a single point of failure.", sc(150, 85, "diurnal"), slo(300, 99, 600),
    "c:browser; h:dockerhost nodes=1; ng:nginx inst=1; a:docker inst=1; d:postgres; k:cache inst=1 hit=0.6", "c>ng>a>k>d, a>d, h>a");
  ex("Docker & Kubernetes", "Docker Swarm cluster", "Several hosts run the same containers behind a load balancer.", sc(900, 85, "diurnal"), slo(250, 99.5, 2500),
    "c:browser; lb:haproxy inst=2; a:docker inst=3 auto; sw:swarm nodes=1 auto max=12; d:mariadb replicas=1; k:cache inst=1 hit=0.8", "c>lb>a>k>d, a>d, sw>a");
  ex("Docker & Kubernetes", "Kubernetes web app with HPA", "The HPA adds pods under load; the node pool has to have room.", sc(4000, 85, "spike", { spikeX: 2.5 }), slo(250, 99.9, 20000),
    "c:browser; ig:k8singress inst=2; a:k8sdeploy inst=32 auto; h:k8shpa; np:k8snodepool nodes=8 auto max=30 multiAz; d:postgres shards=3 replicas=1 ha; k:cache inst=2 hit=0.85", "c>ig>a>k>d, a>d, np>a, h>a");
  ex("Docker & Kubernetes", "Undersized cluster (fix me)", "Pods cannot be scheduled: the node pool is too small and autoscaling is off. Add nodes or turn on the autoscaler.", sc(12000, 85, "steady"), slo(250, 99.9, 60000),
    "c:browser; ig:k8singress inst=2; a:k8sdeploy inst=40; np:k8snodepool nodes=3; d:postgres shards=3 replicas=2 ha; k:cache inst=2 hit=0.85", "c>ig>a>k>d, a>d, np>a");
  ex("Docker & Kubernetes", "Kubernetes StatefulSet database", "A stateful workload with its own disks; scaling and failover are slower than for stateless pods.", sc(1500, 60, "diurnal"), slo(300, 99.9, 20000),
    "c:browser; ig:k8singress inst=2; a:k8sdeploy inst=4 auto; np:k8snodepool nodes=2 auto max=20 multiAz; s:k8ssts inst=6; v:k8spvc", "c>ig>a>s, np>a, np>s, s>v");
  ex("Docker & Kubernetes", "Service mesh with Istio", "Retries and encryption everywhere, paid for with a little latency on every hop.", sc(3000, 80, "diurnal"), slo(250, 99.9, 25000),
    "c:browser; ig:k8singress inst=2; m:istio inst=1; a:k8sdeploy inst=9 auto retries=1 breaker; b:k8sdeploy inst=13 auto; np:k8snodepool nodes=4 auto max=30; d:postgres replicas=1 ha", "c>ig>m>a>b>d, np>a, np>b");
  ex("Docker & Kubernetes", "Zone-resilient cluster", "Nodes spread over three zones: a zone outage costs a third, not half.", sc(4500, 85, "diurnal"), slo(250, 99.95, 30000),
    "c:browser; lb:alb ha; a:k8sdeploy inst=13 auto; np:k8snodepool nodes=3 auto max=40 multiAz; d:aurora replicas=2 ha; k:elasticache inst=3 hit=0.85", "c>lb>a>k>d, a>d, np>a");
  ex("Docker & Kubernetes", "GitOps with Argo CD", "The cluster follows Git: every deployment is reviewed and can be rolled back.", sc(2500, 85, "diurnal"), slo(250, 99.9, 18000),
    "c:browser; ig:k8singress inst=2; a:k8sdeploy inst=6 auto deploy=canary; np:k8snodepool nodes=2 auto max=25; d:postgres replicas=1 ha; g:argocd; h:helm; m:prometheus", "c>ig>a>d, np>a");
  ex("Docker & Kubernetes", "Kubernetes batch jobs", "Jobs come from a queue and run on a node pool that scales with the backlog.", sc(300, 20, "spike", { spikeX: 6 }), slo(1500, 99, 10000),
    "c:client; a:go inst=3 auto; q:rabbit workers=1; j:k8sjob inst=8; np:k8snodepool nodes=2 auto max=30; o:object", "c>a>q>j>o, np>j");
  ex("Docker & Kubernetes", "Multi-service cluster", "Several deployments share one node pool and one database.", sc(3500, 85, "diurnal"), slo(250, 99.9, 25000),
    "c:browser; ig:k8singress inst=2; a:k8sdeploy inst=3 auto; b:k8sdeploy inst=3 auto; s:k8sdeploy inst=3 auto; np:k8snodepool nodes=3 auto max=40 multiAz; d:postgres replicas=2 ha; k:cache inst=3 hit=0.85", "c>ig>a>k>d, ig>b>d, ig>s>d, np>a, np>b, np>s");

  // ------------------------------------------------------------------ DevOps
  ex("DevOps", "CI/CD with monitoring", "A pipeline ships often; monitoring shortens the pain of a bad release.", sc(1800, 85, "diurnal"), slo(250, 99.9, 12000),
    "c:browser; lb:lb ha; a:app inst=4 auto deploy=canary; d:postgres replicas=1 ha; ci:githubactions; m:prometheus; al:alertmanager; pd:pagerduty", "c>lb>a>d");
  ex("DevOps", "Bad release, rolling update (try it)", "Open the Collapse tab and deploy a bad release to the app: a rolling update lets it spread before you notice. No monitoring.", sc(1500, 85, "steady"), slo(250, 99.9, 12000),
    "c:browser; lb:lb ha; a:app inst=6 auto deploy=rolling; d:postgres replicas=1 ha", "c>lb>a>d");
  ex("DevOps", "Bad release, canary plus monitoring", "Same design, canary rollout and Prometheus: a bad release reaches 5% and is caught fast.", sc(1500, 85, "steady"), slo(250, 99.9, 14000),
    "c:browser; lb:lb ha; a:app inst=6 auto deploy=canary; d:postgres replicas=1 ha; m:prometheus; al:alertmanager", "c>lb>a>d");
  ex("DevOps", "Full observability stack", "Metrics, logs and traces: three views of the same incident.", sc(2000, 85, "diurnal"), slo(250, 99.9, 14000),
    "c:browser; lb:lb ha; a:app inst=5 auto; d:postgres replicas=1 ha; m:prometheus; g:grafana; e:elk; t:otel; s:sentry; p:pagerduty", "c>lb>a>d");
  ex("DevOps", "Secrets and identity", "Vault issues short-lived credentials; the app never stores a password.", sc(1200, 85, "diurnal"), slo(250, 99.9, 10000),
    "c:browser; lb:lb ha; a:springboot inst=2 auto; d:postgres replicas=1 ha; v:vault; k:keycloak inst=4; m:prometheus", "c>lb>a>d, a>k");
  ex("DevOps", "Infrastructure as code", "Terraform describes the whole stack, so a second environment is one command.", sc(1500, 85, "diurnal"), slo(250, 99.9, 12000),
    "c:browser; lb:alb ha; a:ec2 inst=4 auto; d:rds replicas=1 ha; tf:terraform; ci:githubactions; m:cloudwatch", "c>lb>a>d");
  ex("DevOps", "Feature flags rollout", "Turn a risky feature on for 1% then more, and off instantly if it goes wrong.", sc(2200, 85, "diurnal"), slo(250, 99.9, 12000),
    "c:browser; lb:lb ha; a:node inst=5 auto deploy=canary; d:postgres replicas=1 ha; f:launchdarkly; m:datadog", "c>lb>a>d");
  ex("DevOps", "DevSecOps pipeline", "Scan code and images before they ship: SonarQube and Trivy in the pipeline.", sc(1800, 85, "diurnal"), slo(250, 99.9, 12000),
    "c:browser; lb:lb ha; a:app inst=4 auto deploy=bluegreen; d:postgres replicas=1 ha; ci:gitlabci; q:sonarqube; t:trivy; r:dockerregistry; m:prometheus", "c>lb>a>d");

  // ------------------------------------------------------------------ Reliability lessons
  ex("Reliability lessons", "Cache stampede (fix me)", "Flush the cache in the Collapse tab: every request hits the database at once. Turn on coalescing.", sc(4500, 97, "steady", { skew: 2.5 }), slo(200, 99.9, 12000),
    "c:browser; lb:lb ha; a:app inst=17 auto; k:cache inst=2 hit=0.97; d:postgres replicas=1 ha", "c>lb>a>k>d");
  ex("Reliability lessons", "Hot key (fix me)", "One celebrity account gets most of the reads. Add cache and replicas, or salt the key.", sc(5000, 96, "steady", { skew: 4 }), slo(200, 99.5, 15000),
    "c:browser; a:app inst=18 auto; d:postgres shards=2", "c>a>d");
  ex("Reliability lessons", "Single point of failure (fix me)", "Kill any box in the Collapse tab: one server, one load balancer and one database means one outage.", sc(800, 85, "steady"), slo(250, 99.9, 6000),
    "c:browser; lb:lb; a:app inst=3; d:postgres", "c>lb>a>d");
  ex("Reliability lessons", "Database failover", "A replica takes over automatically when the primary fails; writes not yet copied are lost.", sc(1500, 70, "steady"), slo(250, 99.9, 14000),
    "c:browser; lb:lb ha; a:app inst=6 auto; p:postgres ha; r:postgres mode=replica peer=p autoPromote", "c>lb>a>p, a>r[r]");
  ex("Reliability lessons", "Queue backlog", "A slow consumer lets the backlog grow; watch the delay, not just the errors.", sc(1500, 20, "spike", { spikeX: 4 }), slo(500, 99, 8000),
    "c:browser; a:app inst=22 auto; q:queue workers=8; w:worker inst=12; d:postgres replicas=1", "c>a>q>w>d");
  ex("Reliability lessons", "Circuit breaker demo", "A slow dependency and retries can sink everything. Try with and without the breaker.", sc(900, 85, "steady"), slo(400, 99.5, 8000),
    "c:browser; lb:lb ha; a:app inst=4 auto retries=2 timeout=400 breaker fallback; p:thirdparty ratio=0.5 inst=3; d:postgres replicas=1 ha", "c>lb>a>d, a>p");
  ex("Reliability lessons", "Bot flood", "A WAF and rate limiter shed the bots before your servers do.", sc(1500, 90, "steady", { botFrac: 0.4 }), slo(250, 99.5, 9000),
    "c:browser; w:waf; l:limiter; lb:lb ha; a:app inst=4 auto; k:cache inst=2 hit=0.85; d:postgres replicas=1", "c>w>l>lb>a>k>d");
  ex("Reliability lessons", "Read replicas for scale", "Reads go to replicas, writes to the primary: a wire that carries only reads.", sc(4000, 92, "diurnal"), slo(250, 99.9, 12000),
    "c:browser; lb:lb ha; a:app inst=9 auto; p:postgres ha; r1:postgres mode=replica peer=p; r2:postgres mode=replica peer=p", "c>lb>a>p[w], a>r1[r], a>r2[r]");
  ex("Reliability lessons", "Multi-region active-passive", "A second region sits ready; failover wires send users there when the first fails.", sc(2500, 85, "diurnal"), slo(300, 99.95, 40000),
    "c:browser; g:glb; a:app inst=6 auto region=us; d:postgres ha region=us; b:app inst=1 auto region=eu; e:postgres mode=replica peer=d autoPromote region=eu", "c>g, g>a>d, g>b[f], b>e");

  // ------------------------------------------------------------------ Real products
  ex("Real products", "Video streaming (Netflix style)", "Video bytes come from CDN edges; the API only handles catalogue and playback start.", sc(12000, 98, "diurnal", { staticFrac: 0.85 }), slo(200, 99.95, 70000),
    "c:browser; cdn:cdn; o:object; gw:apigw; a:java inst=3 auto; k:redis-cluster inst=4 hit=0.9; d:cassandra shards=1", "c>cdn>gw>a>k>d, cdn>o[s]");
  ex("Real products", "Photo sharing (Instagram style)", "Photos in object storage behind a CDN; feeds from cache.", sc(9000, 96, "diurnal", { staticFrac: 0.6 }), slo(220, 99.9, 50000),
    "c:mobile; cdn:cdn; o:object; gw:apigw; a:python inst=12 auto; k:redis-cluster inst=4 hit=0.9; d:postgres shards=1 replicas=2 ha", "c>cdn>gw>a>k>d, cdn>o[s], a>d");
  ex("Real products", "File sync (Dropbox style)", "Metadata in a database, file blocks in object storage, notifications over a stream.", sc(2000, 70, "diurnal"), slo(300, 99.95, 25000),
    "c:client; gw:apigw; a:go inst=2 auto; d:postgres shards=1 replicas=2 ha; o:object; q:kafka workers=1; ws:wsgateway inst=1", "c>gw>a>d, a>o, a>q>ws");
  ex("Real products", "Vacation rentals (Airbnb style)", "Search is the hard part: filters, maps and availability together.", sc(3500, 92, "diurnal", { staticFrac: 0.35 }), slo(350, 99.9, 30000),
    "c:browser; cdn:cdn; gw:apigw; a:java inst=4 auto; s:elasticsearch replicas=2; d:postgres replicas=2 ha; k:cache inst=3 hit=0.85; m:maps ratio=0.2 inst=4; p:payment ratio=0.03 inst=2", "c>cdn>gw>a>k>d, a>d, a~s, a>m, a>p");
  ex("Real products", "Payments platform (Stripe style)", "Correctness first: idempotency, replicas for reads, tight timeouts, never lose a write.", sc(1200, 45, "diurnal"), slo(250, 99.99, 40000),
    "c:client; gw:kong inst=1; a:java inst=2 auto retries=1 breaker; d:postgres shards=2 replicas=2 ha; q:kafka workers=1; b:thirdparty ratio=0.4 inst=3; k:cache inst=2 hit=0.7", "c>gw>a>k>d, a>d, a>b, a>q");
  ex("Real products", "Video upload site (YouTube style)", "Upload, transcode in the background, then serve from the edge.", sc(6000, 97, "diurnal", { staticFrac: 0.8 }), slo(250, 99.9, 60000),
    "c:browser; cdn:cdn; o:object; gw:apigw; a:go inst=1 auto; d:mysql shards=1 replicas=2 ha; q:kafka workers=1; t:worker inst=1; k:cache inst=3 hit=0.9", "c>cdn>gw>a>k>d, cdn>o[s], a>q>t>o, a>d");
  ex("Real products", "Pastebin", "Tiny reads and writes; expiry means old data can be dropped.", sc(700, 90, "diurnal"), slo(150, 99.5, 2500),
    "c:browser; cdn:cdn; a:go inst=1 auto; k:cache inst=1 hit=0.9; d:dynamo", "c>cdn>a>k>d, a>d");
  ex("Real products", "Ticket sale (flash crowd)", "Everyone arrives at once and wants the same seats: queue them, protect the database.", sc(800, 60, "spike", { spikeX: 10, skew: 3 }), slo(600, 99.5, 40000),
    "c:browser; cdn:cdn; w:waf; l:limiter; lb:lb ha; a:java inst=23 auto; q:queue workers=2; d:postgres shards=1 replicas=1 ha; k:cache inst=3 hit=0.8", "c>cdn>w>l>lb>a>k>d, a>q>d");
  ex("Real products", "Online banking", "Correctness and audit above all: strong consistency, no lost writes, careful failover.", sc(1500, 60, "diurnal"), slo(300, 99.99, 40000),
    "c:browser; w:waf; lb:lb ha; a:java inst=3 auto retries=1 breaker; d:oracle shards=2 replicas=2 ha; k:cache inst=2 hit=0.7; a2:auth inst=1; m:datadog", "c>w>lb>a>k>d, a>d, a>a2");
  ex("Real products", "Healthcare records", "Privacy and availability: everything is encrypted and access is audited.", sc(600, 70, "diurnal"), slo(400, 99.95, 15000),
    "c:browser; w:waf; lb:lb ha; a:dotnet inst=1 auto; d:sqlserver replicas=1 ha; o:object; k:keycloak inst=2; t:logs", "c>w>lb>a>d, a>o, a>k");
  ex("Real products", "Food delivery", "Orders, driver tracking and payments: each has a different load shape.", sc(3500, 60, "spike", { spikeX: 3 }), slo(300, 99.9, 30000),
    "c:mobile; gw:apigw; a:go inst=15 auto; k:redis-cluster inst=3 hit=0.85; d:postgres replicas=2 ha; q:kafka workers=2; m:maps ratio=0.15 inst=5; p:stripe ratio=0.1 inst=8", "c>gw>a>k>d, a>d, a>q, a>m, a>p");
  ex("Real products", "Hotel booking", "Availability checks are frequent; the booking write must not double-sell a room.", sc(1600, 92, "diurnal"), slo(350, 99.9, 12000),
    "c:browser; cdn:cdn; lb:lb ha; a:springboot inst=3 auto; k:cache inst=2 hit=0.85; d:postgres replicas=2 ha; s:elasticsearch replicas=1; p:payment ratio=0.05 inst=2", "c>cdn>lb>a>k>d, a>d, a~s, a>p");
  ex("Real products", "Email newsletter service", "Sending is a batch job through a queue; open tracking is a light write.", sc(900, 30, "spike", { spikeX: 8 }), slo(500, 99, 5000),
    "c:browser; a:node inst=23 auto; q:sqs workers=8; w:worker inst=17; e:email ratio=0.8 inst=12; d:mysql shards=2", "c>a>d, a>q>w>e");
  ex("Real products", "Customer support chat", "A chatbot answers first; a human queue takes over when needed.", sc(180, 60, "diurnal"), slo(3500, 99.5, 12000),
    "c:browser; ws:wsgateway inst=1; a:node inst=1 auto; m:openai ratio=0.7 inst=8; v:pgvector; d:postgres replicas=1; q:queue workers=1", "c>ws>a>d, a>m, a~v, a>q");

  // ------------------------------------------------------------------ End to end: Java, security, audit, DevOps, cloud
  ex("End to end", "Audit logging system", "Every service writes audit events to a stream; workers store them in an append-only store, archive them and index them for investigators.", sc(6000, 20, "diurnal"), slo(400, 99.95, 30000),
    "c:browser; gw:apigw; a:springboot inst=10 auto; q:kafka workers=3; w:worker inst=11 auto; al:auditlog inst=1; o:object; e:elasticsearch replicas=1 shards=9; si:siem; kc:keycloak inst=18; m:prometheus; pd:pagerduty",
    "c>gw>a>q>w>al, w>o, w>e, a~kc, si>al, m>pd");
  ex("End to end", "Compliance-ready cloud landing zone", "A small app inside a governed AWS account: every action logged, configuration checked against rules, threats detected, findings in one place.", sc(800, 85, "diurnal"), slo(300, 99.9, 12000),
    "c:browser; w:waf-aws; lb:alb ha; a:fargate inst=2 auto; d:aurora replicas=1 ha; s:s3; al:auditlog inst=1; ct:cloudtrail; awc:awsconfig; gd:guardduty; ih:inspector; sh:securityhub; i:iam; km:secretsmanager; cw:cloudwatch; pd:pagerduty; cf:cloudformation",
    "c>w>lb>a>d, a>s, a~al, cf>a, i>a, km>a, ct>sh, awc>sh, gd>sh, ih>sh, cw>pd");
  ex("End to end", "DevSecOps pipeline, commit to production", "Every gate a change passes: build, unit tests, code scan, dependency scan, image scan, signing, staging, canary release and runtime monitoring.", sc(1500, 85, "diurnal"), slo(250, 99.9, 15000),
    "c:browser; lb:lb ha; a:app inst=4 auto deploy=canary; d:postgres replicas=1 ha; gr:gitrepo; bs:buildserver; mv:maven; sq:sonarqube; sn:snyk; tv:trivy; cs:codesign; hb:harbor; st:stagingenv; ac:argocd; vt:vault; pr:prometheus; am:alertmanager; pd:pagerduty; se:sentry; tf:terraform",
    "c>lb>a>d, gr>bs>mv>sq>sn>tv>cs>hb>st>ac>a, vt>a, pr>a, se>a, pr>am>pd, tf>a");

  // ------------------------------------------------------------------ build
  const KNOWN_STATIC = 1;
  function parseVal(v) { if (v === "?") return "?"; if (/^-?\d+(\.\d+)?$/.test(v)) return +v; if (v === "true") return true; if (v === "false") return false; return v; }
  function parseNodes(spec) {
    return spec.split(";").map((s) => s.trim()).filter(Boolean).map((s) => {
      const tok = s.split(/\s+/), head = tok.shift(), i = head.indexOf(":"), props = {};
      tok.forEach((t) => { const j = t.indexOf("="); if (j < 0) props[t] = true; else props[t.slice(0, j)] = t.slice(0, j) === "name" ? t.slice(j + 1).replace(/_/g, " ") : parseVal(t.slice(j + 1)); });
      return { id: head.slice(0, i), type: head.slice(i + 1), props };
    });
  }
  function parseEdges(spec) {
    const out = [];
    spec.split(/[\s,]+/).filter(Boolean).forEach((chain) => {
      const parts = chain.split(/([>~])/); // a > b ~ c
      const ref = (t) => { const m = /^([A-Za-z0-9_-]+)(?:\[([rwsf])\])?(?:\{([0-9.]+)\})?$/.exec(t); if (!m) throw new Error("bad edge " + t); return { id: m[1], mod: m[2], share: m[3] };  };
      let prev = ref(parts[0]);
      for (let k = 1; k < parts.length; k += 2) {
        const op = parts[k], cur = ref(parts[k + 1]), e = { from: prev.id, to: cur.id };
        if (op === "~") { e.fan = true; e.w = cur.share ? +cur.share : 1; } else if (cur.share) e.w = +cur.share;
        if (cur.mod === "r" || cur.mod === "w" || cur.mod === "s") e.only = cur.mod; if (cur.mod === "f") e.failover = true;
        out.push(e); prev = cur;
      }
    });
    return out;
  }
  const CLS_OF = (types, t) => (types[t] ? types[t].cls : "service");
  function layout(nodes, edges, types) {
    const passive = (n) => ["pool", "passive"].includes(CLS_OF(types, n.type));
    const depth = {}, out = {}; nodes.forEach((n) => { out[n.id] = []; }); edges.forEach((e) => { if (out[e.from]) out[e.from].push(e.to); });
    const q = nodes.filter((n) => CLS_OF(types, n.type) === "source").map((n) => n.id); q.forEach((x) => { depth[x] = 0; });
    for (let i = 0; i < q.length; i++) { const x = q[i]; (out[x] || []).forEach((y) => { if (depth[y] == null || depth[y] < depth[x] + 1) { if (depth[x] + 1 < 12) { depth[y] = depth[x] + 1; q.push(y); } } }); }
    const cols = {}, extra = [];
    nodes.forEach((n) => { if (depth[n.id] == null || passive(n)) extra.push(n); else (cols[depth[n.id]] = cols[depth[n.id]] || []).push(n); });
    const keys = Object.keys(cols).map(Number).sort((a, b) => a - b), pos = {};
    const maxRows = Math.max(1, ...keys.map((k) => cols[k].length));
    keys.forEach((k, ci) => { cols[k].forEach((n, ri) => { pos[n.id] = { x: 80 + ci * 215, y: 60 + (ri - (cols[k].length - 1) / 2) * 105 + (maxRows - 1) * 52 + 40 }; }); });
    // tooling boxes (pipelines, monitoring, security): one row per connected chain, in flow order, then the loose ones
    const ex = new Set(extra.map((n) => n.id)), par = {}; extra.forEach((n) => { par[n.id] = n.id; });
    const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
    edges.forEach((e) => { if (ex.has(e.from) && ex.has(e.to)) par[find(e.from)] = find(e.to); });
    const comps = {}; extra.forEach((n, i) => { (comps[find(n.id)] = comps[find(n.id)] || []).push({ n, i }); });
    const rank = {}; extra.forEach((n) => { rank[n.id] = 0; });
    for (let pass = 0; pass < extra.length; pass++) { let moved = false; edges.forEach((e) => { if (ex.has(e.from) && ex.has(e.to) && rank[e.to] <= rank[e.from]) { rank[e.to] = rank[e.from] + 1; moved = true; } }); if (!moved) break; }
    const groups = Object.values(comps).sort((a, b) => b.length - a.length), rowsOut = []; let loose = [];
    groups.forEach((gp) => { if (gp.length === 1) loose.push(gp[0]); else rowsOut.push(gp.sort((a, b) => rank[a.n.id] - rank[b.n.id] || a.i - b.i)); });
    if (loose.length) rowsOut.push(loose.sort((a, b) => a.i - b.i));
    let ry = 60 + maxRows * 105 + 60;
    rowsOut.forEach((r) => { for (let i = 0; i < r.length; i += 7) { r.slice(i, i + 7).forEach((it, k) => { pos[it.n.id] = { x: 80 + k * 215, y: ry }; }); ry += 95; } });
    return pos;
  }

  /* Turn any built design into an end-to-end one: central authentication, an audit trail, the delivery pipeline and monitoring
   * are added around whatever the example already does. `entry` (optional) picks the node everything hangs off; otherwise the
   * first thing the client talks to is used. Skips fix-me puzzles and designs that already are end-to-end. */
  function endToEnd(g, types, opts) {
    opts = opts || {};
    if (/\(fix me\)/i.test(g.name) || g.e2e) return g;
    const byId = {}; g.nodes.forEach((n) => { byId[n.id] = n; });
    const cls = (id) => (types[byId[id].type] || {}).cls;
    let entry = opts.entry;
    if (!entry) { const e0 = g.edges.find((e) => byId[e.from] && cls(e.from) === "source"); entry = e0 ? e0.to : (g.nodes.find((n) => cls(n.id) !== "source") || g.nodes[0]).id; }
    const base = (g.scenario && g.scenario.base) || 500, shape = g.scenario && g.scenario.shape;
    const peak = base * (shape === "spike" ? (g.scenario.spikeX || 4) : shape === "diurnal" ? 1.5 : shape === "ramp" ? 1.3 : 1.15);
    const idpInst = Math.max(2, Math.ceil(peak / 350)), auditQps = peak * 0.15, workerInst = Math.max(2, Math.ceil(auditQps / 220)), busWorkers = Math.max(2, Math.ceil(auditQps / 900));
    // don't duplicate tooling the design already has: find an existing node covering each role, by tag or equivalence group
    const hasTag = (tag) => g.nodes.find((n) => (types[n.type] || {}).tag === tag);
    const hasEq = (eq) => g.nodes.find((n) => (types[n.type] || {}).eq === eq);
    const existingIdp = hasEq("idp"), existingAudit = hasTag("audit"), existingMonitor = hasTag("monitoring"), existingAlert = hasTag("alerting"),
      existingScm = hasTag("scm"), existingCicd = hasTag("cicd"), existingBuild = hasTag("build"), existingQuality = hasTag("quality"),
      existingScan = hasTag("security-scan"), existingRegistry = hasTag("registry"), existingDeploy = hasTag("gitops") || hasTag("deploy");
    const maxY = Math.max(0, ...g.nodes.map((n) => n.y)), row1Y = maxY + 130, row2Y = maxY + 230;
    const extraNodes = [], extraEdges = [], cursor = {}; const place = (row, y) => { cursor[y] = cursor[y] || 0; row.forEach(([id, type, props]) => { extraNodes.push({ id, type, x: 80 + cursor[y] * 195, y, props: Object.assign({ name: type }, props) }); cursor[y] += 1; }); };
    // central auth: reuse an identity provider the design already has, otherwise add one
    const idpId = existingIdp ? existingIdp.id : "z_idp";
    if (!existingIdp) place([["z_idp", "keycloak", { name: "Central auth server", inst: idpInst }]], row1Y);
    else { const cap = types[existingIdp.type].cap || 350; existingIdp.props.inst = Math.max(1, +existingIdp.props.inst || 1) + Math.max(1, Math.ceil(peak / cap)); }   // give it enough extra capacity for the added auth checks
    extraEdges.push({ from: entry, to: idpId, fan: true, w: 1 });
    // audit trail: reuse an existing append-only audit store; otherwise add the bus, writer and store
    if (existingAudit) { existingAudit.props.inst = Math.max(1, +existingAudit.props.inst || 1) + 1; extraEdges.push({ from: entry, to: existingAudit.id, fan: true, w: 0.15 }); }
    else { place([["z_bus", "kafka", { name: "Audit bus", workers: busWorkers }], ["z_aw", "worker", { name: "Audit writer", inst: workerInst, auto: true }], ["z_al", "auditlog", { name: "Audit log store", inst: 2 }]], row1Y); extraEdges.push({ from: entry, to: "z_bus", fan: true, w: 0.15 }, { from: "z_bus", to: "z_aw", fan: true, w: 1 }, { from: "z_aw", to: "z_al" }); }
    // monitoring and alerting: reuse what is already there
    const moId = existingMonitor ? existingMonitor.id : "z_mo"; if (!existingMonitor) place([["z_mo", "prometheus", {}]], row1Y); extraEdges.push({ from: moId, to: entry });
    if (!existingAlert) { place([["z_pd", "pagerduty", {}]], row1Y); extraEdges.push({ from: moId, to: "z_pd" }); }
    // build and deploy pipeline: only the missing steps are added, chained together and into whatever the design already has
    const steps = [["scm", existingScm, "z_gr", "gitrepo"], ["cicd", existingCicd, "z_ci", "githubactions"], ["build", existingBuild, "z_mv", "maven"], ["quality", existingQuality, "z_sq", "sonarqube"], ["scan", existingScan, "z_sn", "snyk"], ["registry", existingRegistry, "z_er", "dockerregistry"], ["deploy", existingDeploy, "z_cd", "argocd"]];
    const chain = steps.filter((s) => !s[1]).map((s) => s[2]);
    if (chain.length) { place(chain.map((id) => [id, steps.find((s) => s[2] === id)[3], {}]), row2Y); for (let i = 1; i < chain.length; i++) extraEdges.push({ from: chain[i - 1], to: chain[i] }); extraEdges.push({ from: chain[chain.length - 1], to: entry }); }
    const bump = (n) => Math.round(n * 1.2 + 25);
    let addedCost = 0; extraNodes.forEach((n) => { const d = types[n.type] || {}; const mult = n.props.inst || n.props.workers || 1; addedCost += (d.cost || 0) * mult; });
    return { name: g.name, nodes: g.nodes.concat(extraNodes), edges: g.edges.concat(extraEdges), scenario: g.scenario, slo: Object.assign({}, g.slo, { p95: bump(g.slo.p95), budget: Math.round(g.slo.budget + addedCost * 1.25 + 100) }), e2e: true };
  }
  function build(e, types, sizes) {
    const nodes = parseNodes(e.nodes), edges = parseEdges(e.edges), pos = layout(nodes, edges, types), ids = new Set(nodes.map((n) => n.id));
    edges.forEach((x) => { if (!ids.has(x.from) || !ids.has(x.to)) throw new Error(e.name + ": edge to unknown node " + x.from + ">" + x.to); });
    let qn = 0;
    nodes.forEach((n) => { Object.keys(n.props).forEach((k) => { if (n.props[k] === "?") { n.props[k] = (sizes || e.sizes) && (sizes || e.sizes)[e.name] && (sizes || e.sizes)[e.name][qn] != null ? (sizes || e.sizes)[e.name][qn] : 1; qn += 1; } }); });
    const built = { name: e.name, nodes: nodes.map((n) => Object.assign({ id: n.id, type: n.type }, pos[n.id], { props: n.props })), edges, scenario: e.scenario, slo: e.slo };
    return (e.cat === "End to end" || e.noE2E) ? built : endToEnd(built, types);
  }
  // full platform architectures (many services, central auth, audit, pipeline): generated by platforms.js and sized by platform_sizes.js
  (function () {
    const node = typeof module === "object" && module.exports, g = typeof self !== "undefined" ? self : globalThis;
    let PL = null, SZ = {};
    if (node) { try { PL = require("./platforms.js"); } catch (e) { PL = null; } try { SZ = require("./platform_sizes.js"); } catch (e) { SZ = {}; } } else { PL = g.LabPlatforms; SZ = g.LabPlatformSizes || {}; }
    if (PL) PL.DESIGNS.forEach((d) => L.push(Object.assign({}, d, { sizes: SZ, generated: true })));
  })();
  // ------------------------------------------------------------------ Classic interview systems
  // Added after the generated platforms so the positions (ids x0, x1, ...) of earlier examples do not change.
  // Which systems to cover was checked against public collections (learning/system-design/sources/README.md);
  // the designs and wording are our own. Sized with tools/size_classics.js.
  ex("Classic interview systems", "Web crawler", "No users wait on this one: a queue of URLs feeds fetchers, and a 'seen' set stops you crawling the same page twice.", sc(2000, 20, "steady"), slo(800, 99.5, 3000),
    "c:client name=Seed_URLs; a:go name=URL_frontier inst=4; q:kafka name=URLs_to_fetch workers=4; f:worker name=Fetchers inst=8; k:cache name=Seen_URLs inst=2 hit=0.6; d:cassandra name=Page_index; o:object name=Raw_pages", "c>a>q>f>k>d, f>o");
  ex("Classic interview systems", "Rate limiter service", "Counting requests per user must be fast and shared by every server, so the counters live in an in-memory store, not the database.", sc(8000, 95, "spike", {"spikeX":3,"botFrac":0.3}), slo(120, 99.9, 4000),
    "c:client; gw:apigw inst=2; l:limiter name=Rate_limiter inst=2; a:go name=Protected_API inst=22 auto; k:redis-cluster name=Request_counters inst=3 hit=0.9; d:postgres replicas=1", "c>gw>l>a>k>d, a>d");
  ex("Classic interview systems", "Search autocomplete (typeahead)", "Every keystroke is a request, so answers must come from memory in a few milliseconds; the suggestion list is rebuilt in the background.", sc(12000, 99, "diurnal", {"skew":2.5}), slo(80, 99.9, 4000),
    "c:browser; cdn:cdn; lb:lb ha; a:go name=Suggest_API inst=6 auto; k:cache name=Popular_prefixes inst=3 hit=0.95; s:elasticsearch name=Prefix_index replicas=2; q:kafka name=Search_log workers=2; w:worker name=Suggestion_builder inst=2", "c>cdn>lb>a>k>s, a>q>w>s");
  ex("Classic interview systems", "Key-value store (Dynamo style)", "No single machine holds everything: data is split across shards and each shard is copied, so one failure loses nothing.", sc(9000, 70, "steady"), slo(60, 99.95, 5500),
    "c:client; lb:nlb; a:go name=Coordinator_nodes inst=15; d:cassandra name=Storage_nodes shards=3 replicas=2", "c>lb>a>d");
  ex("Classic interview systems", "Distributed cache service", "A cache is a promise to forget: it answers most reads from memory and only the misses reach the slower database behind it.", sc(15000, 92, "diurnal", {"skew":2}), slo(50, 99.9, 5000),
    "c:client; lb:nlb; a:go name=Cache_proxy inst=10 auto; k:redis-cluster name=Cache_nodes inst=6 hit=0.9; d:postgres name=Source_of_truth replicas=2 ha", "c>lb>a>k>d");
  ex("Classic interview systems", "Login and sessions", "Checking who you are happens on every request, so sessions sit in a fast cache while passwords stay in the protected database.", sc(3000, 90, "diurnal", {"botFrac":0.15}), slo(200, 99.95, 2000),
    "c:browser; w:waf; lb:lb ha; au:auth name=Login_service inst=4 auto; k:cache name=Sessions inst=2 hit=0.9; d:postgres name=Accounts replicas=1 ha; e:email name=Reset_emails ratio=0.03", "c>w>lb>au>k>d, au>d, au>e");
  ex("Classic interview systems", "Instant bank payments (UPI style)", "Money must never be sent twice: every payment has one owner, is written before the bank is called, and can be retried safely.", sc(4000, 30, "diurnal"), slo(400, 99.95, 4000),
    "c:mobile; gw:apigw inst=2; a:java name=Payment_switch inst=6 auto retries=1 breaker; d:postgres name=Transaction_ledger shards=2 replicas=1 ha; b:thirdparty name=Bank_systems ratio=0.7 inst=11; q:kafka name=Payment_events workers=2; n:notify name=Payment_alerts inst=4", "c>gw>a>d, a>b, a>q>n");
  ex("Classic interview systems", "Music streaming (Spotify style)", "The songs themselves come from storage through a CDN; your servers only handle the small requests like search, playlists and what to play next.", sc(9000, 96, "diurnal", {"staticFrac":0.7}), slo(200, 99.9, 4000),
    "c:mobile; cdn:cdn; o:object name=Audio_files; gw:apigw inst=2; a:java name=Catalog_and_playlists inst=6 auto; k:cache inst=3 hit=0.9; d:postgres replicas=2 ha; s:elasticsearch name=Song_search replicas=1", "c>cdn>gw>a>k>d, cdn>o[s], a~s");
  ex("Classic interview systems", "Social network (Facebook style)", "Who-knows-whom is a graph and gets its own store; the feed is prepared in the background so opening the app is one fast read.", sc(14000, 95, "diurnal", {"skew":2}), slo(250, 99.9, 19500),
    "c:mobile; cdn:cdn; gw:apigw inst=3; a:java name=Social_API inst=20 auto; k:redis-cluster name=Feed_cache inst=6 hit=0.9; d:mysql name=Posts_and_profiles shards=2 replicas=2 ha; g:neptune name=Friend_graph replicas=5 shards=4; q:kafka name=New_posts workers=4; w:worker name=Feed_builder inst=6", "c>cdn>gw>a>k>d, a>d, a~g, a>q>w>k");
  ex("Classic interview systems", "Community threads and votes (Reddit style)", "Votes arrive in bursts on a few hot posts: count them through a queue instead of hitting the database on every click.", sc(6000, 94, "spike", {"spikeX":2,"skew":3}), slo(250, 99.9, 6500),
    "c:browser; cdn:cdn; lb:lb ha; a:python name=Forum_API inst=46 auto; k:cache name=Hot_threads inst=3 hit=0.9; d:postgres replicas=2 ha; q:queue name=Votes workers=4; w:worker name=Vote_counter inst=3", "c>cdn>lb>a>k>d, a>d, a>q>w>d");
  ex("Classic interview systems", "Web search engine (Google style)", "Searching does not read the web: it reads an index built earlier, split over many machines and answered together.", sc(10000, 99, "diurnal", {"skew":2}), slo(200, 99.95, 4500),
    "c:browser; lb:lb ha; a:go name=Query_service inst=10 auto; k:cache name=Popular_queries inst=4 hit=0.7; s:elasticsearch name=Web_index replicas=3; q:kafka name=Crawled_pages workers=4; w:worker name=Indexer inst=4", "c>lb>a>k>s, a>q>w>s");
  ex("Classic interview systems", "Short video feed (TikTok style)", "Videos are served from the edge; the hard part is picking the next video quickly for millions of people at once.", sc(16000, 97, "diurnal", {"staticFrac":0.8,"skew":2}), slo(200, 99.9, 7000),
    "c:mobile; cdn:cdn; o:object name=Video_files; gw:apigw inst=3; a:go name=Feed_API inst=10 auto; r:python name=Recommender inst=6 auto; k:redis-cluster name=Ready_feeds inst=6 hit=0.9; d:cassandra name=Video_metadata; q:kafka name=Uploads workers=3; t:worker name=Transcoder inst=4", "c>cdn>gw>a>k>d, cdn>o[s], a~r, a>q>t>o");
  ex("Classic interview systems", "Online store builder (Shopify style)", "Thousands of small shops share one platform: split the data per shop so one busy shop cannot slow the others.", sc(5000, 88, "spike", {"spikeX":3,"staticFrac":0.4}), slo(300, 99.9, 7500),
    "c:browser; cdn:cdn; lb:lb ha; a:rails name=Storefront_and_admin inst=46 auto; k:cache inst=3 hit=0.85; d:mysql name=Shop_databases shards=3 replicas=1 ha; p:payment ratio=0.05 inst=3; q:sqs name=Order_jobs; w:worker name=Order_worker inst=3", "c>cdn>lb>a>k>d, a>d, a>p, a>q>w>d");
  ex("Classic interview systems", "Message queue (Kafka style)", "A queue is an append-only log split into partitions: producers write to the end, consumers read at their own pace.", sc(20000, 50, "steady"), slo(60, 99.95, 8000),
    "c:client name=Producers_and_consumers; lb:nlb; b:go name=Brokers inst=29; d:cassandra name=Partition_log shards=4 replicas=2; z:zookeeper name=Cluster_metadata", "c>lb>b>d, b~z{0.05}");
  ex("Classic interview systems", "Flight booking", "Searching is cheap and constant, booking is rare and must be exact: two people must never get the same seat.", sc(3000, 95, "diurnal"), slo(500, 99.9, 3500),
    "c:browser; cdn:cdn; lb:lb ha; a:java name=Booking_API inst=6 auto retries=1 breaker; k:cache name=Search_results inst=2 hit=0.8; d:postgres name=Bookings replicas=1 ha; s:elasticsearch name=Flight_search replicas=1; b:thirdparty name=Airline_systems ratio=0.2 inst=3; p:payment ratio=0.03; q:queue name=Tickets_to_send; e:email ratio=0.03", "c>cdn>lb>a>k>d, a>d, a~s, a>b, a>p, a>q>e");
  ex("Classic interview systems", "Online code runner (judge)", "Running a stranger's code is slow and risky: queue each submission and run it in a throwaway sandbox, never on the web server.", sc(600, 60, "spike", {"spikeX":6}), slo(600, 99.5, 2500),
    "c:browser; lb:lb; a:node name=Submission_API inst=10 auto; k:cache inst=1 hit=0.8; d:postgres name=Results replicas=1; q:sqs name=Submissions; w:k8sjob name=Sandbox_runners inst=10; o:object name=Test_cases", "c>lb>a>k>d, a>d, a>q>w>d, w>o");
  ex("Classic interview systems", "Digital wallet", "The balance you see is a cached number; the truth is a ledger where every movement of money is written once and never edited.", sc(3500, 60, "diurnal"), slo(300, 99.95, 4000),
    "c:mobile; gw:apigw inst=2; a:java name=Wallet_API inst=6 auto retries=1 breaker; k:cache name=Balances inst=2 hit=0.7; d:postgres name=Ledger shards=2 replicas=1 ha; q:kafka name=Transactions workers=2; w:worker name=Reconciliation inst=2; n:notify inst=2", "c>gw>a>k>d, a>d, a>q>w>d, q>n");
  ex("Classic interview systems", "Nearby places (Yelp style)", "Finding what is close means searching by location, which a normal table does badly: a geo index answers 'near me' quickly.", sc(5000, 97, "diurnal"), slo(250, 99.9, 3500),
    "c:mobile; cdn:cdn; lb:lb ha; a:go name=Places_API inst=6 auto; k:cache name=Popular_areas inst=2 hit=0.85; d:postgres name=Places_and_reviews replicas=2 ha; s:elasticsearch name=Geo_index replicas=1", "c>cdn>lb>a>k>d, a~s");
  ex("Classic interview systems", "Maps and navigation (Google Maps style)", "Map pictures are files served from the edge; routes are computed on a road graph, and live traffic arrives as a stream.", sc(12000, 92, "diurnal", {"staticFrac":0.7}), slo(300, 99.9, 6500),
    "c:mobile; cdn:cdn; o:object name=Map_tiles; gw:apigw inst=3; a:go name=Routing_service inst=12 auto; k:redis-cluster name=Live_traffic inst=4 hit=0.8; d:cassandra name=Road_graph; q:kafka name=Location_updates workers=4; w:flink name=Traffic_aggregator inst=4", "c>cdn>gw>a>k>d, cdn>o[s], a>q>w>k");
  ex("Classic interview systems", "Video calls (Zoom style)", "Setting up a call is a small request; the video itself flows through relay servers, which are what you run out of first.", sc(4000, 50, "diurnal"), slo(150, 99.9, 4500),
    "c:client; lb:nlb; sg:wsgateway name=Signalling inst=3 auto; a:go name=Meeting_service inst=4 auto; m:go name=Media_relays inst=10 auto; k:cache name=Room_state inst=2 hit=0.8; d:postgres replicas=1 ha shards=3", "c>lb>sg>a>k>d, a>d, sg~m");
  ex("Classic interview systems", "Object storage (S3 style)", "Two different jobs: a small fast database remembers where each file is, and big cheap disks hold the bytes.", sc(7000, 85, "steady"), slo(200, 99.95, 4500),
    "c:client; lb:lb ha; a:go name=Storage_API inst=8 auto; k:cache name=Metadata_cache inst=2 hit=0.8; m:cassandra name=File_metadata shards=2 replicas=2; o:object name=Data_nodes", "c>lb>a>k>m, a>o");
  ex("Classic interview systems", "Distributed lock service", "When many servers must agree on who goes first, a small group of machines votes so that losing one of them changes nothing.", sc(2500, 60, "steady"), slo(60, 99.95, 1000),
    "c:client name=Services_needing_a_lock; lb:nlb; a:go name=Lock_API inst=4; z:zookeeper name=Consensus_group inst=3", "c>lb>a>z");
  ex("Classic interview systems", "Job scheduler", "Jobs are stored first and run later: a queue hands them to workers, and a finished job is recorded so it never runs twice.", sc(1500, 40, "spike", {"spikeX":4}), slo(400, 99.9, 4500),
    "c:client; lb:lb; a:app name=Scheduler_API inst=15 auto; d:postgres name=Job_store replicas=1 ha shards=2; q:queue name=Due_jobs workers=4; w:worker name=Job_runners inst=6", "c>lb>a>d, a>q>w>d");
  ex("Classic interview systems", "Personal finance tracker (Mint style)", "Bank data is fetched in the background on a schedule, so opening the app only reads what was already collected.", sc(1200, 92, "diurnal"), slo(300, 99.5, 2000),
    "c:mobile; gw:apigw; a:python name=Accounts_API inst=4 auto; k:cache inst=1 hit=0.8; d:postgres name=Transactions replicas=1; q:queue name=Accounts_to_sync; w:worker name=Bank_sync inst=3; b:thirdparty name=Bank_feeds ratio=1 inst=2", "c>gw>a>k>d, a>d, a>q>w>d, w>b");
  ex("Classic interview systems", "Best-seller ranking (Amazon style)", "Rankings are not computed when you look: orders are counted in the background and the page shows the last finished result.", sc(4000, 98, "diurnal"), slo(200, 99.9, 4000),
    "c:browser; cdn:cdn; lb:lb ha; a:app name=Ranking_API inst=7 auto; k:cache name=Ranked_lists inst=2 hit=0.95; d:postgres name=Rank_tables replicas=2; q:kafka name=Order_events workers=2; w:spark name=Rank_aggregator inst=2", "c>cdn>lb>a>k>d, a>q>w>d");
  ex("Classic interview systems", "Game leaderboard", "A sorted list in memory gives a player's rank instantly; the database is only the safe copy.", sc(7000, 80, "spike", {"spikeX":2}), slo(100, 99.9, 7000),
    "c:mobile; gw:apigw inst=2; a:go name=Score_API inst=15 auto; k:redis-cluster name=Sorted_scores inst=4 hit=0.9; d:postgres name=Score_history replicas=5 shards=2; q:kafka name=Score_events workers=2", "c>gw>a>k>d, a>q>d");
  ex("Classic interview systems", "Email service (Gmail style)", "Mailboxes are huge but each person reads only their own, so mail is stored per user, attachments go to file storage, and search has its own index.", sc(8000, 85, "diurnal"), slo(300, 99.95, 7500),
    "c:browser; lb:lb ha; a:java name=Mail_API inst=10 auto; k:cache name=Inbox_cache inst=3 hit=0.85; d:cassandra name=Mailboxes shards=2 replicas=2; o:object name=Attachments; s:elasticsearch name=Mail_search replicas=3; q:kafka name=Incoming_mail workers=3; w:worker name=Spam_filter inst=4", "c>lb>a>k>d, a>o, a~s, a>q>w>d");
  ex("Classic interview systems", "Trending topics (top K)", "Counting everything exactly is too slow at this volume: a stream counts in short time windows and keeps only the top few in memory.", sc(12000, 85, "diurnal", {"skew":2}), slo(150, 99.9, 7000),
    "c:mobile; gw:apigw inst=3; a:go name=Trends_API inst=8 auto; k:redis-cluster name=Top_lists inst=4 hit=0.95; d:clickhouse name=History; q:kafka name=Events workers=6; w:flink name=Window_counter inst=6", "c>gw>a>k>d, a>q>w>k");
  ex("Classic interview systems", "Unique ID generator", "Asking one database for the next number does not scale: each server gets its own number range and creates IDs without asking anyone.", sc(15000, 0, "steady"), slo(45, 99.95, 2500),
    "c:client name=Services_needing_IDs; lb:nlb; a:go name=ID_servers inst=25; z:zookeeper name=Server_number_registry", "c>lb>a, a~z{0.01}");
  return { LIST: L, build, endToEnd, parseNodes, parseEdges, layout, KNOWN_STATIC };
});
