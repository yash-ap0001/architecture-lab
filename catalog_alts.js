/* Decision tables: for each kind of component, the options and when to pick or avoid each.
 * Shown on hover ("why this, and why not the others") and in the Selected tab. Each entry: [id, pick it when, avoid it when]. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.LabAlts = factory(); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const G = [];
  const g = (name, question, ...rows) => G.push({ name, question, rows });

  // ---------------------------------------------------------------- edge and traffic
  g("CDN", "Where should static and cacheable content be served from?",
    ["cdn", "you just need edge caching and do not care about the vendor", "you need edge logic, purge control or a vendor SLA"],
    ["cloudflare", "you want CDN, DDoS protection and a firewall in one easy setup", "you need deep integration with one cloud's services"],
    ["fastly", "you need instant purge and programmable edge logic (news, APIs)", "you want the cheapest plan or zero configuration"],
    ["cloudfront", "your origin is already on AWS (S3, ALB) and you want simple integration", "you run on another cloud or need advanced edge rules"],
    ["cloudcdn", "you use Google's global load balancer and Cloud Storage", "your backends are outside Google Cloud"],
    ["frontdoor", "you are on Azure and want CDN, routing and WAF together", "you only need a plain cache on another cloud"],
    ["akamai", "you are an enterprise with huge global traffic and security needs", "you are small: it is expensive and heavy to set up"]);
  g("DNS and global routing", "How do users find the right region or server?",
    ["dns", "a simple name-to-address lookup is enough", "you need health checks or routing by location"],
    ["route53", "you are on AWS and want health checks, latency or failover routing", "you need vendor-neutral tooling"],
    ["clouddns", "your workloads are on Google Cloud", "you need routing by user location (use a load balancer)"],
    ["trafficmanager", "you are on Azure and need DNS-based routing across regions", "you need instant failover (DNS caches delay it)"],
    ["glb", "you need to steer traffic across regions with health awareness", "one region is enough"],
    ["globalaccel", "you need static IPs and fast failover over the AWS backbone", "you are not on AWS or have simple needs"]);
  g("Firewall and DDoS", "How do you stop bad traffic before it reaches the app?",
    ["waf", "you need to block common web attacks and bad bots", "the threat is pure network flooding (use DDoS protection)"],
    ["waf-aws", "your entry point is CloudFront or an ALB", "you are on another cloud"],
    ["cloudarmor", "your entry point is Google's load balancer", "you are not on Google Cloud"],
    ["azwaf", "your entry point is Application Gateway or Front Door", "you are not on Azure"],
    ["shield", "you fear large volumetric DDoS on AWS", "you only need rules for web attacks (use a WAF)"],
    ["firewall2", "you need network-level allow/deny between subnets", "you need application-level attack rules"],
    ["limiter", "you need to cap requests per client or per second", "you need attack signatures (use a WAF)"]);
  g("Web load balancer and proxy", "What sits in front of your servers and spreads requests?",
    ["lb", "you need the generic idea: spread load, drop dead servers", "you need routing rules on paths and headers"],
    ["alb", "you are on AWS and route by host or path to containers or Lambda", "you need raw TCP speed (use an NLB)"],
    ["cloudlb", "you are on Google Cloud and want one global address", "you need TCP-only pass through"],
    ["appgw", "you are on Azure and want URL routing plus WAF", "you need global multi-region routing (use Front Door)"],
    ["nginx", "you want a simple, fast, well-known reverse proxy you control", "you need dynamic service discovery out of the box"],
    ["haproxy", "you need very high performance and fine control of TCP and HTTP", "you want easy configuration and automatic HTTPS"],
    ["envoy", "you need retries, timeouts and rich metrics, or run a service mesh", "you want the simplest possible setup"],
    ["traefik", "you run Docker or Kubernetes and want automatic service discovery", "you need extreme raw performance tuning"],
    ["caddy", "you want automatic HTTPS with almost no configuration", "you need advanced load balancing features"],
    ["ingress", "you want the standard HTTP entry point of a Kubernetes cluster", "you are not on Kubernetes"],
    ["k8singress", "you run Kubernetes and route hosts and paths to services", "your traffic is not HTTP"]);
  g("Network load balancer", "How do you balance raw TCP or UDP at high speed?",
    ["nlb", "you need extreme throughput, static IPs or non-HTTP protocols on AWS", "you need path-based routing (use an ALB)"],
    ["cloudlb-net", "you need TCP or UDP balancing on Google Cloud", "you need HTTP routing"],
    ["azlb", "you need TCP or UDP balancing on Azure", "you need URL routing (use Application Gateway)"]);
  g("API gateway", "Where do authentication, quotas and routing for your APIs live?",
    ["apigw", "you need a generic front door with auth and limits", "you need advanced monetisation or analytics"],
    ["apigw-aws", "you use Lambda or other AWS backends", "you need heavy customisation or very high request volume at low cost"],
    ["apigee", "you sell or share APIs and need keys, quotas and analytics", "you have a couple of internal services"],
    ["apim", "you are on Azure and want managed policies and a developer portal", "you want the cheapest possible option"],
    ["kong", "you want an open-source gateway with plugins you can run anywhere", "you do not want to operate it yourself"],
    ["graphql", "clients need to pick exactly the fields they want across services", "your clients are simple or you need HTTP caching"]);
  g("Service mesh", "How do services talk to each other securely and reliably?",
    ["mesh", "you want the general idea: sidecars handle retries and encryption", "you have only a few services"],
    ["istio", "you need rich traffic rules, canaries and strong security policy", "you want low overhead and simplicity"],
    ["linkerd", "you want a light, simple mesh with low overhead", "you need advanced traffic management"]);

  // ---------------------------------------------------------------- compute
  g("Virtual machines", "Do you need a full server that you control?",
    ["app", "you just need a generic application server", "you need a specific platform"],
    ["ec2", "you need full control on AWS (special software, GPUs, long-running jobs)", "you want no server management (use containers or Lambda)"],
    ["gce", "you need full control on Google Cloud or custom machine sizes", "you want to avoid patching servers"],
    ["azvm", "you need full control on Azure or Windows workloads", "you want managed scaling and patching"]);
  g("Serverless functions", "Should code run only when called, with no servers?",
    ["serverless", "you want the generic idea: pay per call and scale automatically", "you need steady heavy traffic (cost) or long jobs"],
    ["lambda", "you are on AWS with spiky or event-driven work", "you need over 15 minutes per run or very low latency without cold starts"],
    ["gcf", "you are on Google Cloud and react to events", "you need long-running or stateful work"],
    ["azfunctions", "you are on Azure and want easy triggers and bindings", "you have constant high load where a container is cheaper"]);
  g("Serverless containers", "Do you want to run a container without managing servers?",
    ["fargate", "you run containers on AWS (ECS or EKS) without servers", "you need full node control or GPUs"],
    ["cloudrun", "you want the simplest container hosting, scaling to zero", "you need long-lived background processes or complex networking"],
    ["containerapps", "you are on Azure and want scale-to-zero containers with Dapr or KEDA", "you need full Kubernetes control"],
    ["aci", "you need a quick single container or burst capacity on Azure", "you need orchestration for many services"],
    ["apprunner", "you want to deploy from a repo or image with almost no setup on AWS", "you need fine control over networking and scaling"]);
  g("Managed app platforms", "Do you want the platform to run your code with minimal setup?",
    ["beanstalk", "you are on AWS and want to upload code and go", "you want modern container workflows"],
    ["appengine", "you are on Google Cloud with a standard web app", "you need custom runtimes or lots of control"],
    ["appservice", "you are on Azure with .NET, Java or Node web apps", "you need containers with complex orchestration"]);
  g("Language and framework", "Which stack runs your business logic?",
    ["java", "you build large business systems with a big ecosystem", "you need tiny memory use or instant startup"],
    ["springboot", "you are on Java and want the most common enterprise framework", "you need very fast startup (serverless) without tuning"],
    ["node", "you have many I/O-bound requests and share code with the frontend", "you have heavy CPU work per request"],
    ["nestjs", "you want structure and TypeScript in a large Node backend", "you only need a tiny script"],
    ["python", "you build fast, or your service is data or ML heavy", "you need high throughput per server"],
    ["django", "you build content or admin-heavy sites quickly", "you need a lightweight microservice"],
    ["fastapi", "you build async APIs with automatic docs, often for ML", "you need a full admin and ORM out of the box"],
    ["go", "you need fast, small services that handle very many connections", "you need a huge library ecosystem for business rules"],
    ["rustsvc", "you need top performance and safety with low memory", "your team needs to move fast and lacks Rust skills"],
    ["kotlin", "you want a modern JVM language, concise and Java compatible", "you have no JVM expertise"],
    ["dotnet", "you are in a Microsoft shop and need fast, typed services", "your team has no .NET experience"],
    ["rails", "you must ship a product fast with conventions", "you need very high throughput per server"],
    ["laravel", "you build a PHP web app quickly with a rich ecosystem", "you need very low-latency services"],
    ["elixir", "you need millions of concurrent connections (chat, live updates)", "you need a large hiring pool"],
    ["grpcsvc", "internal services need compact, fast, typed calls", "browsers or partners call it directly"],
    ["bff", "one client (web or mobile) needs a tailored combined API", "you have a single simple client"]);
  g("Batch and data jobs", "How do you run big offline jobs?",
    ["awsbatch", "you have queued jobs on AWS that need managed compute", "you need real-time processing"],
    ["gcpbatch", "you run batch jobs on Google Cloud", "you need streaming"],
    ["azbatch", "you run large parallel jobs on Azure", "you need low-latency work"],
    ["k8sjob", "you already run Kubernetes and jobs fit in pods", "you have no cluster (overkill)"],
    ["spark", "you crunch very large datasets across a cluster", "your data fits on one machine"],
    ["dataflow", "you want managed stream and batch pipelines on Google Cloud", "you want to avoid Apache Beam"],
    ["celery", "you need background tasks in a Python or Ruby app from a queue", "you need heavy distributed data processing"],
    ["worker", "you need a generic background worker", "you need a specific framework"]);
  g("Workflow orchestration", "How do you coordinate multi-step processes?",
    ["stepfn", "you orchestrate AWS services with retries and branches", "you need very high-volume, low-cost simple flows"],
    ["workflows-gcp", "you orchestrate Google Cloud services and APIs", "you need complex data pipelines (use Airflow)"],
    ["logicapps", "you want low-code integrations across many SaaS tools on Azure", "you need custom high-performance logic"],
    ["airflow", "you schedule data pipelines with dependencies as code", "you need real-time event flows"]);
  g("Kubernetes and machine pools", "What machines do your containers run on?",
    ["eks", "you want managed Kubernetes on AWS", "you do not need Kubernetes (use Fargate or ECS)"],
    ["gke", "you want the most mature managed Kubernetes on Google Cloud", "you have simple workloads (Cloud Run is easier)"],
    ["aks", "you are on Azure and want managed Kubernetes", "you want to avoid cluster operations"],
    ["k8snodepool", "you model a generic cluster node pool", "you need a provider-specific feature"],
    ["asg", "you run EC2 servers that must scale and self-heal", "you use containers on Fargate"],
    ["mig", "you run Google VMs that must scale and self-heal", "you use Cloud Run"],
    ["vmss", "you run Azure VMs that must scale", "you use App Service or containers"],
    ["dockerhost", "you run a few containers on a single machine", "you need failover or scale across machines"],
    ["swarm", "you want simple clustering for Docker with little to learn", "you need the Kubernetes ecosystem"]);
  g("Container workloads", "How do you run and scale your containers?",
    ["docker", "you package one service as a container", "you need orchestration on its own"],
    ["k8sdeploy", "you run stateless services with rolling updates", "you run databases (use a StatefulSet)"],
    ["k8ssts", "you run stateful workloads needing stable identity and disks", "your service is stateless"],
    ["k8sds", "you need one agent on every node (logs, monitoring)", "you need a scalable service"],
    ["k8sjob", "you run one-off or scheduled work to completion", "you need an always-on service"],
    ["compose", "you start several containers together on one machine (local or small setups)", "you need scaling or failover across machines"]);


  // ---------------------------------------------------------------- data
  g("Relational database", "Where do transactional records live?",
    ["sql", "you need transactions and joins with the generic model", "you need a specific engine"],
    ["postgres", "you want a powerful open-source database with JSON and extensions", "you need vendor-managed operations"],
    ["mysql", "you run read-heavy web apps with replicas", "you need advanced SQL features"],
    ["mariadb", "you want an open-source MySQL-compatible drop-in", "you need the newest MySQL features"],
    ["rds", "you want managed PostgreSQL or MySQL on AWS", "you need higher performance than a single writer gives"],
    ["aurora", "you need faster, more scalable MySQL/PostgreSQL on AWS with many replicas", "you want the cheapest option"],
    ["cloudsql", "you want managed SQL on Google Cloud", "you need global scale (use Spanner)"],
    ["alloydb", "you want faster PostgreSQL with analytics on Google Cloud", "you need the lowest cost"],
    ["azuresql", "you are on Azure with SQL Server workloads", "you prefer open-source engines"],
    ["azpostgres", "you want managed PostgreSQL on Azure", "you need SQL Server features"],
    ["oracle", "you already depend on Oracle features and support", "you want low licence cost"],
    ["sqlserver", "you are in a Microsoft shop with .NET", "you want to avoid licences"],
    ["sqlite", "you have a small app or embedded use with one writer", "you need several servers writing"]);
  g("Distributed SQL", "Do you need SQL that scales across nodes or regions?",
    ["spanner", "you need global scale with strong consistency and can pay for it", "you are small (very costly)"],
    ["cockroach", "you want distributed SQL that survives zone failures, PostgreSQL style", "you need the lowest write latency in one region"],
    ["yugabyte", "you want distributed PostgreSQL-compatible SQL", "a single Postgres is enough"],
    ["tidb", "you want MySQL-compatible SQL that scales and also serves analytics", "you need simple operations"]);
  g("Document database", "Do you store flexible JSON-like documents?",
    ["mongo", "your data shape changes often and you want rich queries", "you need multi-row transactions everywhere"],
    ["documentdb", "you want MongoDB-compatible managed on AWS", "you need the newest MongoDB features"],
    ["cosmos", "you need global distribution and tunable consistency on Azure", "you want the lowest cost"],
    ["firestore", "you build mobile or web apps needing realtime sync", "you need complex queries and joins"]);
  g("Key-value and wide-column", "Do you need huge scale with simple access patterns?",
    ["dynamo", "you need single-digit millisecond access at any scale", "you need ad-hoc queries and joins"],
    ["dynamodb-aws", "you are on AWS and want serverless key-value scale", "your access patterns change often"],
    ["bigtable", "you need huge throughput for time series or analytics keys on Google Cloud", "you need small datasets or SQL"],
    ["cassandra", "you need massive write volume across data centres", "you need strong consistency or joins"],
    ["keyspaces", "you want Cassandra compatibility managed on AWS", "you need every Cassandra feature"],
    ["scylla", "you want Cassandra-compatible with very high throughput and low latency", "you need a big managed ecosystem"]);
  g("Graph database", "Are relationships the main thing you query?",
    ["neo4j", "you traverse relationships deeply (recommendations, fraud rings)", "you mostly do simple lookups"],
    ["neptune", "you want a managed graph on AWS", "you need the Neo4j ecosystem"]);
  g("Time-series database", "Is your data a stream of timestamped measurements?",
    ["influx", "you store metrics or sensor data with time queries", "you need relational features"],
    ["timescale", "you want time series inside PostgreSQL with SQL", "you need extreme ingest without Postgres"],
    ["timestream", "you want a managed time-series store on AWS", "you need advanced analytics tools"]);
  g("Search engine", "Do users search text with filters?",
    ["search-db", "you need full-text search and aggregations", "you need exact-match lookups only"],
    ["elasticsearch", "you need powerful search and log analytics", "you want the simplest setup"],
    ["opensearch-aws", "you want managed OpenSearch on AWS", "you need Elastic's newest features"],
    ["solr", "you have an existing Solr investment", "you are starting fresh"],
    ["meilisearch", "you need fast search-as-you-type with easy setup", "you need huge log analytics"],
    ["search", "you run your own search service in front of an index", "you would rather use a managed search product"]);
  g("Vector database", "Do you search by meaning (embeddings)?",
    ["vector", "you need similarity search for RAG or recommendations", "you need only keyword search"],
    ["pinecone", "you want fully managed vector search with no operations", "you need to self-host or keep costs low"],
    ["weaviate", "you want open-source vector search with hybrid search", "you need a fully managed service without ops"],
    ["qdrant", "you want fast, filtered open-source vector search", "you need a huge managed ecosystem"],
    ["milvus", "you have billions of vectors", "you have a small dataset"],
    ["pgvector", "your data is already in PostgreSQL and the scale is moderate", "you need billions of vectors"]);
  g("Warehouse and analytics", "Do you run large analytical queries?",
    ["warehouse", "you need reporting over large history", "you need many small updates"],
    ["redshift", "you want a warehouse on AWS", "you want fully serverless with no sizing"],
    ["bigquery", "you want serverless SQL over terabytes on Google Cloud", "you need predictable cost under constant load"],
    ["synapse", "you are on Azure with analytics workloads", "you want the simplest option"],
    ["clickhouse", "you need very fast aggregates on huge event tables", "you need frequent single-row updates"],
    ["clickhouse2", "you need sub-second dashboards on fresh data", "you need batch-only reports"],
    ["athena", "you query files in S3 occasionally and pay per query", "you run constant heavy queries"]);
  g("Cache", "Do you want to answer repeated reads from memory?",
    ["cache", "you want the standard Redis-style cache", "you need durability as a primary store"],
    ["memcached", "you need a simple, multi-threaded key-value cache", "you need data structures or persistence"],
    ["dragonfly", "you want Redis-compatible and much higher throughput per node", "you rely on rare Redis modules"],
    ["elasticache", "you are on AWS and want managed Redis or Memcached", "you need it outside AWS"],
    ["memorystore", "you are on Google Cloud and want managed Redis", "you need it outside Google Cloud"],
    ["azredis", "you are on Azure and want managed Redis", "you need it outside Azure"],
    ["redis-cluster", "the cache is bigger than one machine or needs more throughput", "a single node is enough"],
    ["hazelcast", "you use Java and want a shared in-memory data grid", "you are not on the JVM"],
    ["memorydb", "you want Redis-compatible speed with durability on AWS", "you only need a cache"],
    ["varnish", "you want to cache whole HTTP pages in front of web servers", "you cache data objects (use Redis)"]);
  g("Object storage", "Where do files, images and backups live?",
    ["object", "you need cheap, huge, durable file storage", "you need fast small reads and writes"],
    ["s3", "you are on AWS or want the most common object API", "you need file-system semantics"],
    ["gcs", "you are on Google Cloud", "you need file-system semantics"],
    ["blob", "you are on Azure", "you need file-system semantics"],
    ["minio", "you need S3-compatible storage you run yourself", "you do not want to operate storage"],
    ["ceph", "you run large self-hosted storage for objects, blocks and files", "you want simple operations"]);
  g("File and block storage", "Do servers need a shared folder or a disk?",
    ["efs", "many AWS servers need a shared file system", "you need cheap large storage (use S3)"],
    ["filestore", "many Google VMs need a shared file system", "you need cheap large storage"],
    ["azfiles", "you need an SMB or NFS share on Azure", "you need cheap large storage"],
    ["nfs", "you run a shared network folder yourself", "you need a managed, scalable service"],
    ["ebs", "one AWS server needs a fast disk for a database", "several servers must share it"],
    ["persistentdisk", "one Google VM needs a durable disk", "several VMs must share it"],
    ["azdisk", "one Azure VM needs a durable disk", "several VMs must share it"],
    ["hdfs", "you run big-data jobs that need distributed storage", "you are not on Hadoop"],
    ["k8spvc", "a pod needs data that survives restarts", "the data is disposable"]);

  // ---------------------------------------------------------------- messaging
  g("Message queue", "Do you need to hand work to workers reliably?",
    ["queue", "you need to smooth spikes and process later", "you need many consumers to replay the same events"],
    ["sqs", "you want a simple managed queue with no servers", "you need complex routing or ordering across everything"],
    ["sqs-aws", "you are on AWS and need unlimited-scale queues", "you need replay (use Kinesis or Kafka)"],
    ["servicebus", "you need enterprise queues with dead-lettering and ordering on Azure", "you need the highest throughput"],
    ["rabbit", "you need flexible routing (exchanges, topics) for task queues", "you need to replay a huge log"],
    ["amazonmq", "you migrate an app that already uses RabbitMQ or ActiveMQ to AWS", "you are building new (use SQS)"],
    ["activemq", "you have Java JMS applications", "you are starting fresh"],
    ["cloudtasks", "you need delayed or rate-limited HTTP tasks on Google Cloud", "you need pub/sub fan-out"]);
  g("Event stream / log", "Do many consumers need to read and replay a firehose?",
    ["kafka", "you need very high volume, replay and many consumers", "you need a simple queue (too heavy)"],
    ["msk", "you want Kafka managed on AWS", "you want zero operations (use Kinesis)"],
    ["kinesis", "you want a managed stream on AWS without running Kafka", "you need the Kafka ecosystem"],
    ["eventhubs", "you want a managed stream on Azure, Kafka compatible", "you need complex routing"],
    ["stream", "you need an ordered stream for real-time processing", "you need work distribution"],
    ["pulsar", "you need multi-tenant streaming and queuing in one system", "you want the biggest ecosystem"],
    ["redisstreams", "you already run Redis and need a light stream", "you need huge retention or throughput"],
    ["nats2", "you need very light, fast messaging with optional persistence", "you need a big data-pipeline ecosystem"]);
  g("Pub/sub and event routing", "Should one event reach many different subscribers?",
    ["pubsub", "you publish once for many subscribers", "you need work queues with a single consumer"],
    ["sns", "you fan out on AWS to queues, email, SMS and functions", "you need replay"],
    ["gcppubsub", "you want global messaging on Google Cloud", "you need strict ordering across everything"],
    ["eventgrid", "you route events from Azure services to handlers", "you need a high-volume stream"],
    ["eventbridge", "you route events between AWS services and SaaS by rules", "you need very high throughput"],
    ["eventarc", "you trigger Google Cloud services from events", "you need a general message bus"]);
  g("Stream processing", "How do you compute on data while it flows?",
    ["flink", "you need exact stateful stream processing with windows", "you only need simple transforms"],
    ["kafkastreams", "you use Kafka and want processing inside your app", "you need a separate cluster for heavy jobs"],
    ["spark", "you process big batches (and micro-batches)", "you need millisecond latency"],
    ["dataflow", "you want managed pipelines on Google Cloud", "you want to avoid Beam"],
    ["dbt", "you transform data inside the warehouse with SQL models", "you need to process streams or files outside a warehouse"]);

  // ---------------------------------------------------------------- AI
  g("Hosted LLM API", "Where does the language model run?",
    ["bedrock", "you are on AWS and want many models behind one API", "you need a model AWS does not offer"],
    ["gemini", "you are on Google Cloud or need very long context", "you need models from other vendors"],
    ["azopenai", "you need OpenAI models with Azure's enterprise controls", "you are not on Azure"],
    ["openai", "you want the simplest access to a leading model", "you must keep data inside your own cloud"],
    ["llm", "you host your own model on GPUs", "you have low volume (an API is cheaper)"],
    ["llmgw", "you want routing, caching and limits across models", "you use a single provider with light load"]);
  g("Model serving", "How do you serve your own trained models?",
    ["sagemaker", "you train and serve models on AWS", "you need the cheapest serving"],
    ["vertex", "you train and serve models on Google Cloud", "you are not on Google Cloud"],
    ["azureml", "you train and serve models on Azure", "you are not on Azure"],
    ["mlserver", "you need batching and GPU efficiency with Triton or TorchServe", "you want a fully managed service"],
    ["vllm", "you self-host LLMs and need high requests per GPU", "you serve small classical models"],
    ["featurestore", "training and serving need the same features", "you have no ML features"],
    ["embed", "you turn text into vectors for search", "you need generation (use an LLM)"]);

  // ---------------------------------------------------------------- identity and security
  g("Identity and login", "Who handles sign-in and permissions?",
    ["auth", "you build your own authentication service", "you would rather not own password security"],
    ["cognito", "you are on AWS and want managed sign-up and social login", "you need very custom flows"],
    ["identityplatform", "you are on Google Cloud or Firebase", "you need enterprise SSO features"],
    ["entraid", "you are on Azure or need corporate single sign-on", "you serve only consumers with simple needs"],
    ["keycloak", "you want open-source SSO you control", "you do not want to operate it"],
    ["auth0", "you want fast, hosted login with many providers", "you fear vendor lock-in or high per-user cost"],
    ["oauthproxy", "an app has no login and you want one placed in front", "the app already handles authentication"]);
  g("Secrets and keys", "Where do passwords, keys and certificates live?",
    ["secretsmanager", "you are on AWS and need rotation", "you are outside AWS"],
    ["secretmanager", "you are on Google Cloud", "you are outside Google Cloud"],
    ["keyvault", "you are on Azure", "you are outside Azure"],
    ["vault", "you need one audited secrets system across clouds and short-lived credentials", "you want zero operations"],
    ["kms-aws", "you need to encrypt with managed keys on AWS", "you store secrets (use Secrets Manager)"],
    ["cloudkms", "you need managed encryption keys on Google Cloud", "you store secrets"]);

  // ---------------------------------------------------------------- observability
  g("Metrics and monitoring", "How do you see the health of the system?",
    ["metrics", "you want the general idea of collecting numbers over time", "you need a specific tool"],
    ["cloudwatch", "you run on AWS and want built-in metrics", "you run multi-cloud"],
    ["cloudmonitoring", "you run on Google Cloud", "you run multi-cloud"],
    ["azmonitor", "you run on Azure", "you run multi-cloud"],
    ["prometheus", "you run Kubernetes and want open-source metrics and alerts", "you want a hosted product with zero operations"],
    ["grafana", "you need dashboards over many data sources", "you need metrics storage on its own"],
    ["datadog", "you want one hosted product for metrics, logs and traces", "you need a low bill at high volume"]);
  g("Logs", "Where do logs go so you can search them?",
    ["logs", "you want central searchable logs", "you need a specific stack"],
    ["elk", "you want powerful log search you control", "you want zero operations"],
    ["cloudlogging", "you run on Google Cloud", "you run multi-cloud"],
    ["cloudwatch", "you run on AWS", "you need advanced log analytics"]);
  g("Tracing and errors", "How do you follow one request through many services?",
    ["tracing", "you need to see which hop was slow", "you have one service"],
    ["xray", "you run on AWS", "you run multi-cloud"],
    ["cloudtrace", "you run on Google Cloud", "you run multi-cloud"],
    ["appinsights", "you run on Azure and want APM", "you run multi-cloud"],
    ["otel", "you want one vendor-neutral standard for traces, metrics and logs", "you want a finished product (it is only the collection layer)"],
    ["sentry", "you need application errors and crashes with stack traces", "you need infrastructure metrics"]);
  g("Alerting and on-call", "How does a human find out something broke?",
    ["alerting", "you want alerts when metrics cross limits", "you need a specific tool"],
    ["cloudwatch-alarms", "you are on AWS", "you are multi-cloud"],
    ["cloudalerting", "you are on Google Cloud", "you are multi-cloud"],
    ["azalerts", "you are on Azure", "you are multi-cloud"],
    ["alertmanager", "you use Prometheus and want grouping and routing", "you need on-call scheduling"],
    ["pagerduty", "you need on-call rotations and escalation", "you only need email alerts"]);

  // ---------------------------------------------------------------- delivery and infrastructure
  g("CI/CD", "How does code get built, tested and shipped?",
    ["githubactions", "your code is on GitHub and you want CI in the same place", "you need heavy custom on-premise runners"],
    ["jenkins", "you need maximum flexibility and self-hosting", "you do not want to maintain a server"],
    ["gitlabci", "you use GitLab and want everything in one product", "your code is elsewhere"],
    ["circleci", "you want fast hosted CI with easy caching", "you want everything inside your cloud"],
    ["codepipeline", "you are on AWS and want native pipelines", "you want portability"],
    ["cloudbuild", "you are on Google Cloud", "you want portability"],
    ["codebuild", "you need managed build servers on AWS", "you want portability"],
    ["azdevops", "you are on Azure or need boards and repos too", "you are all-in on another platform"]);
  g("Infrastructure as code", "How do you describe servers and networks in files?",
    ["terraform", "you want one tool for any cloud", "you only use one cloud and prefer its native tool"],
    ["cloudformation", "you are AWS-only and want native support", "you need multi-cloud"],
    ["deploymentmanager", "you are Google Cloud only", "you want a wider ecosystem"],
    ["bicep", "you are Azure only and want a cleaner ARM", "you need multi-cloud"],
    ["pulumi", "you want to write infrastructure in real programming languages", "your team prefers declarative files"],
    ["ansible", "you configure servers and apps over SSH without agents", "you need to create cloud resources at scale"]);
  g("Registries and artifacts", "Where do images and packages live?",
    ["ecr", "you run containers on AWS", "you run elsewhere"],
    ["artifactregistry", "you run on Google Cloud", "you run elsewhere"],
    ["acr", "you run on Azure", "you run elsewhere"],
    ["dockerregistry", "you need a generic container image registry", "you need a specific cloud integration"],
    ["artifactory", "you store many kinds of packages and builds", "you only need container images"],
    ["harbor", "you want a private registry you run yourself with built-in scanning and signing", "you would rather use your cloud registry with no operations"]);
  g("Deployment tools", "How do releases reach the servers?",
    ["codedeploy", "you deploy to EC2, ECS or Lambda on AWS with rollouts", "you use Kubernetes"],
    ["clouddeploy", "you deliver to GKE or Cloud Run", "you are not on Google Cloud"],
    ["argocd", "you want Git to be the single source of truth for Kubernetes", "you do not run Kubernetes"],
    ["helm", "you package and install Kubernetes applications", "you deploy plain services outside Kubernetes"]);
  g("Private networking", "How do networks connect and stay private?",
    ["vpn", "you need an encrypted tunnel quickly and cheaply", "you need stable high bandwidth"],
    ["directconnect", "you need a private, stable, high-bandwidth line to the cloud", "you are small or in a hurry"],
    ["transitgw", "you connect many networks to a hub", "you have two networks"],
    ["nat", "private servers need outbound internet access", "you need inbound access"],
    ["vpc", "you need an isolated private network", "it is a single tiny app"],
    ["subnet", "you separate public and private tiers", "you have a flat network"]);

  // ---------------------------------------------------------------- external services
  g("Payments", "Who moves the money?",
    ["payment", "you use a generic external payment provider", "you need one specific provider's features"],
    ["stripe", "you want developer-friendly card payments quickly", "you need local methods a bank provider offers"]);
  g("Sending messages", "How do you reach a user outside the app?",
    ["email", "you send transactional or marketing email", "you need instant delivery (use push)"],
    ["smtp", "you relay mail through your own or a provider's SMTP", "you need tracking and analytics"],
    ["sms", "you need reach without an app (OTP)", "you send high volume cheaply (SMS costs per message)"],
    ["pushnotif", "your users have your app installed", "users have no app"],
    ["notify", "you need a service that sends across channels", "you send one channel only"]);
  g("Realtime connections", "How do you keep live connections to clients?",
    ["wsgateway", "you need two-way live updates (chat, collaboration)", "requests and responses are enough"],
    ["elixir", "you need millions of concurrent connections in one stack", "your team has no BEAM experience"]);

  g("Kubernetes building blocks", "Which Kubernetes objects do you need around your pods?",
    ["k8ssvc", "pods need a stable address that balances across them", "traffic comes from outside the cluster (use Ingress)"],
    ["k8scp", "you want to model the cluster brain (API server, scheduler)", "you use a managed cluster that hides it"],
    ["k8shpa", "you want pods to scale with CPU or custom metrics", "load is flat or the database is the limit"],
    ["k8sconfig", "settings should change without rebuilding the image", "the value is a secret"],
    ["k8ssecret", "pods need passwords or tokens", "you need rotation and audit (use Vault or a cloud secret manager)"]);
  g("Security scanning and flags", "How do you catch problems before and after release?",
    ["sonarqube", "you want code quality and security issues found in the pipeline", "you only need runtime protection"],
    ["trivy", "you want container images scanned for known vulnerabilities", "you need to scan source code logic"],
    ["launchdarkly", "you want to turn features on or off without a deploy", "you have no need for gradual rollout"]);
  g("Access and audit", "Who may do what, and who did what?",
    ["iam", "you control permissions on AWS with least privilege", "you need application-level roles"],
    ["cloudtrail", "you need an audit log of every AWS API action", "you need application logs"]);
  g("Coordination", "How do servers agree on who leads and what the settings are?",
    ["zookeeper", "you need leader election, locks and small shared configuration", "you need to store large data"],
    ["k8scp", "you already run Kubernetes, whose etcd store gives you coordination for its own objects", "you need a general lock or election service for other applications"]);
  g("External APIs", "Which outside services does the product depend on?",
    ["thirdparty", "you call some outside API with its own limits", "you can do the work yourself"],
    ["maps", "you need maps, routing or geocoding without building it", "call volume is huge and the per-call price hurts"]);

  g("Java runtime", "How do you run a Java application?",
    ["tomcat", "you deploy WAR files to a classic application server or need JEE features", "you want a self-contained fat JAR (use Spring Boot)"],
    ["springboot", "you want a self-contained JAR with embedded server and the largest ecosystem", "you run legacy JEE modules that need a full application server"],
    ["java", "you need the generic Java service", "you need a specific framework"],
    ["kotlin", "you want a modern JVM language that works with Spring", "you have no Kotlin skills"]);
  g("Microservice platform pieces", "What helps many Java services find and talk to each other?",
    ["springgw", "you run Spring microservices and want routing and filters in code", "you already use a general gateway such as Kong or a cloud API gateway"],
    ["eureka", "services need to discover each other without fixed addresses", "Kubernetes already gives you service discovery"],
    ["configserver", "many services share settings you want to change centrally", "Kubernetes ConfigMaps and secrets already cover it"]);
  g("Source and build", "Where does code live and how is it built?",
    ["gitrepo", "you need version control and pull-request review (always)", "it is the only thing you have and you never automate"],
    ["maven", "you compile and test a Java project into an artifact", "your project is not JVM-based"],
    ["buildserver", "builds must run centrally and repeatably, not on laptops", "a hosted CI service already provides runners"]);
  g("Deploy server", "What actually pushes releases to environments?",
    ["deployserver", "you push builds to servers over SSH or run controlled operator access", "you use GitOps where the cluster pulls its own changes"],
    ["argocd", "the cluster should pull the desired state from Git", "you do not run Kubernetes"],
    ["codedeploy", "you deploy to EC2, ECS or Lambda on AWS with rollouts", "you use Kubernetes"],
    ["clouddeploy", "you deliver to GKE or Cloud Run", "you are not on Google Cloud"]);
  g("Test environments and signing", "How do you gain confidence before production?",
    ["stagingenv", "you need a production-like place to test a release", "cost is tight and canary in production is enough"],
    ["codesign", "only trusted images should run in production", "you have no policy to enforce signatures"]);
  g("Dependency and vulnerability scanning", "How do you find known vulnerabilities?",
    ["snyk", "you want to scan libraries and code in the pipeline", "you only scan finished images"],
    ["inspector", "you want AWS to scan servers and images continuously", "you are outside AWS"]);
  g("Audit log", "Where is the record of who did what?",
    ["auditlog", "your application must keep its own tamper-evident record of business actions", "you only need cloud-level API audit (use the cloud audit log)"],
    ["cloudtrail", "you need every AWS API action recorded", "you need application-level business events"],
    ["cloudaudit", "you need admin and data access logs on Google Cloud", "you need application-level business events"],
    ["azactivity", "you need to know who changed what in Azure", "you need application-level business events"]);
  g("SIEM and security findings", "Where does the security team look?",
    ["siem", "you need one place to correlate security logs from everywhere", "you are small and cloud-native tools are enough"],
    ["securityhub", "you are on AWS and want findings in one view", "you are multi-cloud"],
    ["sentinel", "you are on Azure or Microsoft 365", "you want a vendor-neutral platform"],
    ["chronicle", "you have very large log volumes on Google Cloud", "you are small"]);
  g("Threat detection", "How do you notice an attack in progress?",
    ["guardduty", "you want AWS to spot suspicious activity automatically", "you are outside AWS"],
    ["defender", "you are on Azure and want posture plus threat protection", "you are outside Azure"],
    ["scc", "you are on Google Cloud", "you are outside Google Cloud"]);
  g("Compliance rules", "How do you keep configuration within the rules?",
    ["awsconfig", "you must show AWS resources meet rules over time", "you are outside AWS"],
    ["azpolicy", "you must enforce standards on Azure resources", "you are outside Azure"],
    ["orgpolicy", "you must block unsafe settings across Google Cloud projects", "you are outside Google Cloud"]);
  g("Hardware key protection", "Do keys need tamper-proof hardware?",
    ["cloudhsm", "regulation demands keys never leave certified hardware", "a managed KMS is enough (cheaper and simpler)"],
    ["kms-aws", "managed encryption keys are sufficient", "you need certified hardware isolation"],
    ["cloudkms", "managed encryption keys on Google Cloud are enough", "you need certified hardware isolation"]);

  // ---------------------------------------------------------------- AI safety, failed messages, backups
  g("AI safety and agent control", "How do you keep AI agents and model calls safe?",
    ["guardrails", "model calls take user or document text that could carry injected instructions", "the model only ever sees fixed, trusted internal prompts"],
    ["toolgw", "an agent can call tools or APIs that change data or spend money", "the agent only reads public information"],
    ["approval", "an action moves money, sends messages, deletes data or cannot be undone", "the action is read-only and low risk, where approval only adds delay"],
    ["agent", "a task needs several steps and tool calls that one prompt cannot do", "a single prompt or a fixed workflow already does the job, more cheaply and predictably"]);
  g("Model routing and AI cost control", "How do you keep model spend under control?",
    ["modelrouter", "AI spend is significant and many requests are easy or repeated", "traffic is tiny or every request needs the strongest model"],
    ["llmgw", "you need one place for keys, quotas, logging and provider failover", "a single app calls a single model"]);
  g("Failed message handling", "Where do messages go when processing keeps failing?",
    ["dlq", "a consumer can fail on a bad message and must not block the rest", "the work is fire-and-forget and losing a message is acceptable"],
    ["sqs", "you are on AWS: a redrive policy moves failing messages to a second SQS queue for you", "you need ordered replay of a long event history"]);
  g("Backup and restore", "How is data recovered after deletion, corruption or ransomware?",
    ["backup", "you keep any data you cannot recreate from somewhere else", "the data is a cache or can be rebuilt from another source"],
    ["object", "you export database dumps yourself to versioned, write-locked object storage", "you need point-in-time restore without scripts to maintain"]);

  const BY = {}; G.forEach((grp) => grp.rows.forEach(([id, pick, avoid]) => { (BY[id] = BY[id] || []).push({ group: grp, pick, avoid }); }));
  /* Decision info for a component: its first group, the "why this" and "why not" lines, and the alternatives. */
  function info(id) {
    const hits = BY[id]; if (!hits) return null;
    const h = hits[0], alts = h.group.rows.filter((r) => r[0] !== id).map((r) => ({ id: r[0], pick: r[1], avoid: r[2] }));
    return { group: h.group.name, question: h.group.question, pick: h.pick, avoid: h.avoid, alts };
  }
  return { GROUPS: G, info, BY };
});
