/* Design patterns for enterprise, cloud and security work, with a class diagram and working Java each. Same format as lld_c.js. */
(function (root, factory) { const items = factory(); if (typeof module === "object" && module.exports) module.exports = items; else (root.LabLLDParts = root.LabLLDParts || []).push(...items); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const R = String.raw;
  const P = (group, id, title, ask, func, classes, rels, seen, code, follow, tradeoffs) => ({ kind: "pattern", group, id, title, ask, func, classes, rels, patterns: seen, code, follow, look: tradeoffs });
  const F = (q, a) => ({ q, a });
  const items = [];

  items.push(P("Enterprise & cloud", "di", "Dependency Injection", "Give a class its collaborators from outside instead of letting it create them.",
    ["You want to swap implementations (real, fake, cloud A or B)", "You want to unit test without a database or network", "Object wiring should live in one place"],
    ["OrderService|class|repo; payments|place(order)", "OrderRepository|interface||save(o)", "PaymentClient|interface||charge(amount)", "JdbcOrderRepository|class||", "FakePaymentClient|class||", "Container|class|beans|register(); get()"],
    [["JdbcOrderRepository", "OrderRepository", "implements"], ["FakePaymentClient", "PaymentClient", "implements"], ["OrderService", "OrderRepository", "has"], ["OrderService", "PaymentClient", "has"], ["Container", "OrderService", "uses", "wires"]],
    [["Spring @Autowired / constructor injection", "The container builds and connects beans."], ["Jakarta CDI, Guice, Dagger", "Other injection frameworks."]],
    R`import java.util.*;

interface OrderRepository { void save(String order); }
interface PaymentClient { boolean charge(double amount); }
class OrderService {
  private final OrderRepository repo; private final PaymentClient payments;
  OrderService(OrderRepository r, PaymentClient p) { repo = r; payments = p; }        // constructor injection: dependencies are explicit and final
  String place(String order, double amount) { if (!payments.charge(amount)) return "payment declined"; repo.save(order); return "placed " + order; }
}
class JdbcOrderRepository implements OrderRepository { public void save(String o) { System.out.println("  INSERT order " + o); } }
class FakePaymentClient implements PaymentClient { boolean approve = true; public boolean charge(double a) { return approve; } }
class Container {                                                                      // a tiny container: the one place that knows the wiring
  private final Map<Class<?>, Object> beans = new HashMap<>();
  <T> void register(Class<T> type, T bean) { beans.put(type, bean); }
  <T> T get(Class<T> type) { return type.cast(beans.get(type)); }
}
public class Main {
  public static void main(String[] a) {
    FakePaymentClient fake = new FakePaymentClient();
    Container c = new Container(); c.register(OrderRepository.class, new JdbcOrderRepository()); c.register(PaymentClient.class, fake);
    c.register(OrderService.class, new OrderService(c.get(OrderRepository.class), c.get(PaymentClient.class)));
    OrderService svc = c.get(OrderService.class); System.out.println(svc.place("#1", 50));
    fake.approve = false; System.out.println(svc.place("#2", 50));                     // in a test you swap the dependency, no mocking framework needed
  }
}`,
    [F("Constructor, setter or field injection?", "Constructor injection is best: dependencies are required, immutable and visible, and the class is testable without a container. Field injection hides them."), F("DI vs Service Locator?", "With DI the container pushes dependencies in; with a locator the class pulls them out, which hides the dependencies and hurts testing."), F("What are bean scopes?", "Singleton (one per container, the default), prototype (new each time), request and session for web apps. A stateful bean should not be a singleton.")],
    ["Testable, swappable", "Framework magic can hide wiring", "Circular dependencies need care", "Standard in Spring"]));

  items.push(P("Enterprise & cloud", "repository", "Repository", "Hide data access behind a collection-like interface so the domain does not know about the database.",
    ["Domain code should not contain SQL or driver details", "You want to swap storage (SQL, in memory for tests, NoSQL)", "Queries should have meaningful names"],
    ["User|class|id; email|", "UserRepository|interface||findById(id); findByEmail(e); save(u)", "InMemoryUserRepository|class|store|", "SqlUserRepository|class|dataSource|", "RegistrationService|class|repo|register(email)"],
    [["InMemoryUserRepository", "UserRepository", "implements"], ["SqlUserRepository", "UserRepository", "implements"], ["RegistrationService", "UserRepository", "has"], ["UserRepository", "User", "uses"]],
    [["Spring Data JpaRepository", "Declare an interface, get the implementation generated."], ["DAO pattern", "A close cousin, closer to tables than to the domain."]],
    R`import java.util.*;

record User(long id, String email) { }
interface UserRepository { Optional<User> findById(long id); Optional<User> findByEmail(String email); User save(String email); }
class InMemoryUserRepository implements UserRepository {                // used in tests; a SqlUserRepository would hold the JDBC code
  private final Map<Long, User> store = new LinkedHashMap<>(); private long seq = 0;
  public Optional<User> findById(long id) { return Optional.ofNullable(store.get(id)); }
  public Optional<User> findByEmail(String e) { return store.values().stream().filter(u -> u.email().equalsIgnoreCase(e)).findFirst(); }
  public User save(String email) { User u = new User(++seq, email); store.put(u.id(), u); return u; }
}
class RegistrationService {
  private final UserRepository repo; RegistrationService(UserRepository r) { repo = r; }
  User register(String email) {
    if (repo.findByEmail(email).isPresent()) throw new IllegalStateException("email already registered");
    return repo.save(email);
  }
}
public class Main {
  public static void main(String[] a) {
    RegistrationService svc = new RegistrationService(new InMemoryUserRepository());
    System.out.println(svc.register("asha@example.com"));
    try { svc.register("ASHA@example.com"); } catch (IllegalStateException e) { System.out.println("rejected: " + e.getMessage()); }
  }
}`,
    [F("Repository vs DAO?", "A DAO wraps a table or data source (CRUD). A Repository speaks the language of the domain (aggregates and business queries) and may use several DAOs."), F("Should the repository return entities or DTOs?", "Domain entities from the repository; map to DTOs at the API boundary so your database model does not leak into your API."), F("Transactions?", "Put the transaction boundary in the service layer, not inside the repository.")],
    ["Clean domain code", "Extra layer", "Easy in-memory tests", "Risk of a leaky abstraction"]));

  items.push(P("Enterprise & cloud", "circuitbreaker", "Circuit Breaker", "Stop calling a failing dependency for a while so failures do not cascade.",
    ["A remote service can fail or be slow", "Waiting on it would exhaust your threads", "You want to fail fast and recover automatically"],
    ["CircuitBreaker|class|state; failures; openedAt|call(supplier)", "State|enum|CLOSED; OPEN; HALF_OPEN|", "PaymentService|class||charge()"],
    [["CircuitBreaker", "State", "uses"], ["CircuitBreaker", "PaymentService", "uses", "protects"]],
    [["Resilience4j, Spring Cloud Circuit Breaker", "Libraries that add breakers, retries and bulkheads."], ["Envoy / service meshes", "Outlier detection does this at the proxy."]],
    R`import java.util.function.Supplier;

class CircuitBreaker {
  enum State { CLOSED, OPEN, HALF_OPEN }
  private final int threshold; private final long openMs; private State state = State.CLOSED; private int failures = 0; private long openedAt = 0;
  CircuitBreaker(int threshold, long openMs) { this.threshold = threshold; this.openMs = openMs; }
  synchronized <T> T call(Supplier<T> action, T fallback, long now) {
    if (state == State.OPEN) { if (now - openedAt < openMs) return fallback; state = State.HALF_OPEN; }     // after the wait, let one trial call through
    try { T r = action.get(); failures = 0; state = State.CLOSED; return r; }
    catch (RuntimeException e) { failures++; if (state == State.HALF_OPEN || failures >= threshold) { state = State.OPEN; openedAt = now; } return fallback; }
  }
  State state() { return state; }
}
public class Main {
  static boolean up = false; static int calls = 0;
  static String flaky() { calls++; if (!up) throw new RuntimeException("timeout"); return "paid"; }
  public static void main(String[] a) {
    CircuitBreaker cb = new CircuitBreaker(3, 1000);
    for (int t = 0; t < 6; t++) System.out.println("t=" + t * 100 + " " + cb.call(Main::flaky, "fallback", t * 100L) + " state=" + cb.state() + " downstream calls=" + calls);
    up = true; System.out.println("t=1500 " + cb.call(Main::flaky, "fallback", 1500) + " state=" + cb.state());
  }
}`,
    [F("What are the three states?", "Closed: calls pass and failures are counted. Open: calls fail immediately for a cool-down. Half-open: a trial call decides whether to close again."), F("What should the fallback be?", "A cached value, a default, a degraded feature, or a clear error. Decide per dependency whether failing open or closed is safe."), F("Breaker vs retry?", "Retries help with brief glitches; a breaker protects against sustained failure. Use both, with retries inside the breaker and limits so retries do not multiply load.")],
    ["Prevents cascading failure", "Threshold tuning", "Needs a good fallback", "Combine with timeouts"]));

  items.push(P("Enterprise & cloud", "retry", "Retry with backoff and jitter", "Retry failed calls the safe way: wait longer each time and add randomness.",
    ["Transient errors (timeouts, throttling)", "Calls are idempotent or protected by an idempotency key", "Many clients might retry at the same moment"],
    ["Retry|class|maxAttempts; baseMs; capMs|run(action)", "TransientException|class||"],
    [["Retry", "TransientException", "uses"]],
    [["AWS SDKs, gRPC, Spring Retry", "Exponential backoff with jitter is the default advice."], ["Resilience4j Retry", "Configurable retry policy."]],
    R`import java.util.*;
import java.util.function.Supplier;

class TransientException extends RuntimeException { TransientException(String m) { super(m); } }
class Retry {
  private final int maxAttempts; private final long baseMs, capMs; private final Random rnd;
  Retry(int maxAttempts, long baseMs, long capMs, long seed) { this.maxAttempts = maxAttempts; this.baseMs = baseMs; this.capMs = capMs; rnd = new Random(seed); }
  <T> T run(Supplier<T> action) {
    for (int attempt = 1; ; attempt++) {
      try { return action.get(); }
      catch (TransientException e) {
        if (attempt >= maxAttempts) throw e;                                          // give up: never retry forever
        long ceiling = Math.min(capMs, baseMs * (1L << (attempt - 1))), wait = (long) (rnd.nextDouble() * ceiling);   // full jitter
        System.out.println("  attempt " + attempt + " failed, waiting " + wait + " ms (up to " + ceiling + ")");
      }
    }
  }
}
public class Main {
  static int n = 0;
  public static void main(String[] a) {
    Retry r = new Retry(5, 100, 2000, 42);
    System.out.println(r.run(() -> { if (++n < 4) throw new TransientException("503"); return "ok after " + n + " tries"; }));
    try { new Retry(3, 100, 2000, 1).run(() -> { throw new TransientException("still down"); }); } catch (TransientException e) { System.out.println("gave up: " + e.getMessage()); }
  }
}`,
    [F("Why jitter?", "Without it, clients that failed together retry together and hit the recovering service in synchronised waves. Random delays spread the load."), F("Which errors are retryable?", "Timeouts, 429 and 503. Do not retry client errors (400, 401, 404) or non-idempotent operations without an idempotency key."), F("What is a retry storm?", "Retries multiplying load on an already struggling service. Bound attempts, use budgets and a circuit breaker.")],
    ["Handles transient faults", "Can amplify outages", "Needs idempotent operations", "Cap attempts and time"]));

  items.push(P("Enterprise & cloud", "saga", "Saga (orchestrated)", "Complete a business transaction across services by running local steps and undoing them with compensations if one fails.",
    ["A transaction spans several services with their own databases", "Distributed locks or two-phase commit are not an option", "You can define an undo for every step"],
    ["SagaOrchestrator|class|steps|run(ctx)", "Step|interface||execute(ctx); compensate(ctx)", "ReserveStock|class||", "ChargeCard|class||", "CreateShipment|class||"],
    [["ReserveStock", "Step", "implements"], ["ChargeCard", "Step", "implements"], ["CreateShipment", "Step", "implements"], ["SagaOrchestrator", "Step", "has", "ordered"]],
    [["Axon, Camunda, Temporal, AWS Step Functions", "Engines that run sagas and keep their state."], ["Choreography", "The same idea with events instead of a central orchestrator."]],
    R`import java.util.*;

interface Step { String name(); void execute(Map<String, Object> ctx); void compensate(Map<String, Object> ctx); }
class ReserveStock implements Step {
  public String name() { return "reserve stock"; }
  public void execute(Map<String, Object> c) { System.out.println("  stock reserved"); } public void compensate(Map<String, Object> c) { System.out.println("  stock released"); }
}
class ChargeCard implements Step {
  public String name() { return "charge card"; }
  public void execute(Map<String, Object> c) { if (Boolean.TRUE.equals(c.get("declined"))) throw new IllegalStateException("card declined"); System.out.println("  card charged"); }
  public void compensate(Map<String, Object> c) { System.out.println("  card refunded"); }
}
class CreateShipment implements Step {
  public String name() { return "create shipment"; }
  public void execute(Map<String, Object> c) { System.out.println("  shipment created"); } public void compensate(Map<String, Object> c) { System.out.println("  shipment cancelled"); }
}
class SagaOrchestrator {
  private final List<Step> steps; SagaOrchestrator(List<Step> s) { steps = s; }
  boolean run(Map<String, Object> ctx) {
    Deque<Step> done = new ArrayDeque<>();
    for (Step s : steps) {
      try { s.execute(ctx); done.push(s); }
      catch (RuntimeException e) {
        System.out.println("  " + s.name() + " failed: " + e.getMessage() + " -> compensating");
        while (!done.isEmpty()) done.pop().compensate(ctx);                 // undo in reverse order
        return false;
      }
    }
    return true;
  }
}
public class Main {
  public static void main(String[] a) {
    SagaOrchestrator saga = new SagaOrchestrator(List.of(new ReserveStock(), new ChargeCard(), new CreateShipment()));
    System.out.println("happy path: " + saga.run(new HashMap<>()));
    Map<String, Object> bad = new HashMap<>(); bad.put("declined", true);
    System.out.println("card declined: " + saga.run(bad));
  }
}`,
    [F("Orchestration vs choreography?", "Orchestration uses a central coordinator that tells each service what to do (clear flow, one place to look). Choreography has services react to each other's events (loose coupling, harder to follow)."), F("What if a compensation fails?", "Retry it until it succeeds (it must be idempotent), and alert a human if it cannot. The saga state must be stored durably."), F("Saga vs 2PC?", "Two-phase commit locks resources across services and is fragile at scale. A saga trades isolation for availability: intermediate states are visible, so design for that.")],
    ["No distributed locks", "Eventual consistency", "Compensations must be idempotent", "State must be persisted"]));

  items.push(P("Enterprise & cloud", "outbox", "Transactional Outbox", "Save the data and the event in the same database transaction, then publish the event reliably afterwards.",
    ["You must update the database and send a message, and never do only one", "Publishing directly to a broker inside a transaction can lose or duplicate events", "Consumers must see every change"],
    ["OrderService|class|db; outbox|placeOrder(order)", "Database|class|orders; outbox|transaction(work)", "OutboxRelay|class|db; broker|poll()", "Broker|class|published|publish(e)"],
    [["OrderService", "Database", "has"], ["OutboxRelay", "Database", "uses", "reads"], ["OutboxRelay", "Broker", "uses", "publishes"]],
    [["Debezium (change data capture)", "Reads the outbox table from the database log and publishes it."], ["Spring Modulith, Axon", "Built-in outbox support."]],
    R`import java.util.*;

class Database {
  final List<String> orders = new ArrayList<>(), outbox = new ArrayList<>();
  void transaction(Runnable work, boolean fail) {                  // all-or-nothing: on failure both writes are rolled back
    int o = orders.size(), b = outbox.size();
    try { work.run(); if (fail) throw new RuntimeException("crash before commit"); }
    catch (RuntimeException e) { while (orders.size() > o) orders.remove(orders.size() - 1); while (outbox.size() > b) outbox.remove(outbox.size() - 1); System.out.println("  rolled back: " + e.getMessage()); }
  }
}
class Broker { final List<String> published = new ArrayList<>(); void publish(String e) { published.add(e); System.out.println("  published " + e); } }
class OrderService {
  private final Database db; OrderService(Database d) { db = d; }
  void placeOrder(String order, boolean crash) { db.transaction(() -> { db.orders.add(order); db.outbox.add("OrderPlaced:" + order); }, crash); }
}
class OutboxRelay {
  private final Database db; private final Broker broker; private int sent = 0;
  OutboxRelay(Database d, Broker b) { db = d; broker = b; }
  void poll() { while (sent < db.outbox.size()) { broker.publish(db.outbox.get(sent)); sent++; } }      // at-least-once: consumers must be idempotent
}
public class Main {
  public static void main(String[] a) {
    Database db = new Database(); Broker broker = new Broker(); OrderService svc = new OrderService(db); OutboxRelay relay = new OutboxRelay(db, broker);
    svc.placeOrder("#1", false); svc.placeOrder("#2", true); svc.placeOrder("#3", false);
    relay.poll(); System.out.println("orders " + db.orders + " events " + broker.published);
  }
}`,
    [F("What problem does it solve?", "The dual-write problem: writing to a database and a broker are two separate operations, so a crash between them loses or duplicates the event. The outbox turns both into one local transaction."), F("How is the outbox published?", "A relay polls the table, or change data capture reads the database log. Mark or delete rows after publishing."), F("What guarantee do consumers get?", "At least once, so consumers must be idempotent (see the idempotent consumer pattern).")],
    ["No lost events", "Extra table and relay", "At-least-once delivery", "Works with any broker"]));

  items.push(P("Enterprise & cloud", "idempotent", "Idempotent consumer / idempotency key", "Make sure processing the same message or request twice has the same effect as once.",
    ["Messages and retries can be delivered more than once", "Payments and orders must not be duplicated", "Clients retry after timeouts"],
    ["PaymentApi|class|processed|charge(key, amount)", "IdempotencyStore|interface||seen(key); remember(key, result)"],
    [["PaymentApi", "IdempotencyStore", "has"]],
    [["Stripe Idempotency-Key header", "Repeat a POST safely with the same key."], ["Kafka consumers, SQS", "At-least-once delivery needs idempotent handlers."]],
    R`import java.util.*;

class PaymentApi {
  private final Map<String, String> results = new HashMap<>();          // idempotency key -> stored result (in real life a table with a unique constraint and a TTL)
  private double balance = 100;
  synchronized String charge(String key, double amount) {
    String prior = results.get(key);
    if (prior != null) return prior + " (replayed)";                      // same key: return the first result, do not charge again
    balance -= amount; String r = "charged " + amount + ", balance " + balance; results.put(key, r); return r;
  }
}
public class Main {
  public static void main(String[] a) {
    PaymentApi api = new PaymentApi();
    System.out.println(api.charge("order-42", 30));
    System.out.println(api.charge("order-42", 30));                       // client retried after a timeout
    System.out.println(api.charge("order-43", 30));
  }
}`,
    [F("Where do you keep the keys?", "In the same database transaction as the effect, with a unique constraint, so check-and-write is atomic. Expire keys after a sensible window."), F("What if the same key arrives with a different body?", "Reject it (422) because the client reused a key incorrectly."), F("Natural idempotency?", "Some operations are idempotent by nature (set status = PAID, PUT with a full body). Prefer those over increments.")],
    ["Safe retries", "Storage for keys", "Must be atomic with the effect", "Essential for payments"]));

  items.push(P("Enterprise & cloud", "cqrs", "CQRS", "Use separate models for changing data (commands) and for reading it (queries).",
    ["Read and write loads are very different", "Reads need a shape optimised for screens or search", "You use events or several stores"],
    ["CommandHandler|class|writeStore; events|handle(cmd)", "QueryHandler|class|readModel|find(id)", "Projector|class|readModel|on(event)", "WriteStore|class||", "ReadModel|class||"],
    [["CommandHandler", "WriteStore", "has"], ["Projector", "ReadModel", "has"], ["QueryHandler", "ReadModel", "has"], ["CommandHandler", "Projector", "uses", "events"]],
    [["Axon Framework", "CQRS and event sourcing for Java."], ["Read replicas, search indexes, materialised views", "Read models kept up to date from writes."]],
    R`import java.util.*;

record OrderPlaced(String id, String customer, double total) { }
class CommandHandler {                                   // write side: validates and appends events
  final List<OrderPlaced> eventLog = new ArrayList<>(); private final Projector projector;
  CommandHandler(Projector p) { projector = p; }
  void placeOrder(String id, String customer, double total) {
    if (total <= 0) throw new IllegalArgumentException("total must be positive");
    OrderPlaced e = new OrderPlaced(id, customer, total); eventLog.add(e); projector.on(e);      // in real life this is asynchronous, so the read side is eventually consistent
  }
}
class Projector {                                        // builds a read model shaped for the screen
  final Map<String, Double> spendPerCustomer = new TreeMap<>(); final Map<String, OrderPlaced> byId = new HashMap<>();
  void on(OrderPlaced e) { byId.put(e.id(), e); spendPerCustomer.merge(e.customer(), e.total(), Double::sum); }
}
class QueryHandler {
  private final Projector rm; QueryHandler(Projector p) { rm = p; }
  double totalSpend(String customer) { return rm.spendPerCustomer.getOrDefault(customer, 0.0); }
}
public class Main {
  public static void main(String[] a) {
    Projector p = new Projector(); CommandHandler cmd = new CommandHandler(p); QueryHandler q = new QueryHandler(p);
    cmd.placeOrder("o1", "asha", 120); cmd.placeOrder("o2", "asha", 80); cmd.placeOrder("o3", "ravi", 40);
    System.out.println("asha spent " + q.totalSpend("asha") + ", ravi " + q.totalSpend("ravi") + ", events " + cmd.eventLog.size());
  }
}`,
    [F("When is CQRS overkill?", "For simple CRUD apps. It adds moving parts and eventual consistency; use it when reads and writes really differ."), F("CQRS vs event sourcing?", "They are independent. CQRS separates read and write models; event sourcing stores changes as events. They pair well but neither requires the other."), F("How do you handle read-after-write?", "Return the new state from the command, route that user to the write store briefly, or show a pending state.")],
    ["Optimised reads and writes", "Eventual consistency", "More components", "Pairs with events and search"]));

  items.push(P("Enterprise & cloud", "bulkhead", "Bulkhead", "Isolate resources per dependency so one failing part cannot exhaust everything.",
    ["One slow dependency could use all your threads", "Some features are more important than others", "You want failures contained"],
    ["Bulkhead|class|permits|tryRun(task)", "ServiceClient|class|bulkhead|call()"],
    [["ServiceClient", "Bulkhead", "has"]],
    [["Resilience4j Bulkhead", "Semaphore or thread-pool isolation."], ["Kubernetes resource limits, separate connection pools", "Bulkheads at the infrastructure level."]],
    R`import java.util.concurrent.Semaphore;
import java.util.function.Supplier;

class Bulkhead {
  private final Semaphore permits; Bulkhead(int max) { permits = new Semaphore(max); }
  <T> T tryRun(Supplier<T> task, T rejected) {
    if (!permits.tryAcquire()) return rejected;               // full: reject immediately instead of queuing behind a slow dependency
    try { return task.get(); } finally { permits.release(); }
  }
  int available() { return permits.availablePermits(); }
}
public class Main {
  public static void main(String[] a) throws Exception {
    Bulkhead reports = new Bulkhead(2), checkout = new Bulkhead(5);       // separate pools: reports cannot starve checkout
    Object lock = new Object(); boolean[] release = { false };
    Runnable slow = () -> reports.tryRun(() -> { synchronized (lock) { while (!release[0]) { try { lock.wait(); } catch (InterruptedException e) { return "x"; } } } return "done"; }, "rejected");
    Thread t1 = new Thread(slow), t2 = new Thread(slow); t1.start(); t2.start(); Thread.sleep(100);
    System.out.println("reports permits left: " + reports.available());
    System.out.println("third report request: " + reports.tryRun(() -> "ran", "rejected"));
    System.out.println("checkout still works: " + checkout.tryRun(() -> "ok", "rejected"));
    synchronized (lock) { release[0] = true; lock.notifyAll(); } t1.join(); t2.join();
  }
}`,
    [F("Semaphore or thread pool isolation?", "A semaphore limits concurrent calls on the caller thread (cheap). A dedicated thread pool isolates fully and allows timeouts but costs threads."), F("How is it related to the ship metaphor?", "Watertight compartments: a leak in one section does not sink the ship."), F("Where else do you apply it?", "Separate connection pools per dependency, separate queues per tenant, and CPU or memory limits per container.")],
    ["Contains failures", "Needs sizing", "Rejected requests must be handled", "Pairs with circuit breakers"]));

  items.push(P("Security & audit", "audittrail", "Tamper-evident audit trail", "Record who did what and when in a way that shows any later change.",
    ["Compliance requires proof of actions (payments, access, admin changes)", "Logs must not be silently edited or deleted", "Investigators need to verify integrity"],
    ["AuditEntry|class|seq; actor; action; at; prevHash; hash|", "AuditLog|class|entries|append(actor, action); verify()", "Hasher|class||sha256(text)"],
    [["AuditLog", "AuditEntry", "has", "many"], ["AuditLog", "Hasher", "uses"]],
    [["Blockchain-style hash chains, Amazon QLDB, immutable object lock (WORM)", "Each record commits to the previous one."], ["CloudTrail log file validation", "Digest files prove logs were not altered."]],
    R`import java.security.MessageDigest;
import java.util.*;

class AuditEntry {
  final long seq; final String actor, action, prevHash, hash; final long at;
  AuditEntry(long seq, String actor, String action, long at, String prev) { this.seq = seq; this.actor = actor; this.action = action; this.at = at; prevHash = prev; hash = Hasher.sha256(seq + "|" + actor + "|" + action + "|" + at + "|" + prev); }
}
class Hasher {
  static String sha256(String s) {
    try { byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8")); StringBuilder sb = new StringBuilder(); for (byte b : d) sb.append(String.format("%02x", b)); return sb.substring(0, 12); }   // shortened for display
    catch (Exception e) { throw new IllegalStateException(e); }
  }
}
class AuditLog {
  final List<AuditEntry> entries = new ArrayList<>();
  void append(String actor, String action, long at) { String prev = entries.isEmpty() ? "GENESIS" : entries.get(entries.size() - 1).hash; entries.add(new AuditEntry(entries.size() + 1, actor, action, at, prev)); }   // append only: there is no update or delete
  int verify() {                                                       // returns the first broken sequence number, or 0 when the chain is intact
    String prev = "GENESIS";
    for (AuditEntry e : entries) { AuditEntry recomputed = new AuditEntry(e.seq, e.actor, e.action, e.at, prev); if (!recomputed.hash.equals(e.hash) || !e.prevHash.equals(prev)) return (int) e.seq; prev = e.hash; }
    return 0;
  }
}
public class Main {
  public static void main(String[] a) throws Exception {
    AuditLog log = new AuditLog(); log.append("asha", "LOGIN", 1); log.append("asha", "TRANSFER 500 to ravi", 2); log.append("admin", "DISABLE user meena", 3);
    System.out.println("intact: " + (log.verify() == 0));
    java.lang.reflect.Field f = AuditEntry.class.getDeclaredField("action"); f.setAccessible(true); f.set(log.entries.get(1), "TRANSFER 5 to ravi");    // an attacker edits history
    System.out.println("first broken entry: " + log.verify());
  }
}`,
    [F("Does a hash chain prevent tampering?", "It detects it. An attacker who can rewrite the whole chain can recompute hashes, so anchor the latest hash somewhere else (a separate system, a signed timestamp or WORM storage)."), F("What must an audit record contain?", "Who (authenticated identity), what (action and target), when (trusted time), where (source IP, service), and the result. Never log secrets or full card numbers."), F("How do you keep it available and cheap?", "Write asynchronously through a stream to append-only storage (object lock), index a copy for search, and keep archives for the retention period.")],
    ["Detects tampering", "Needs external anchoring", "Append-only storage", "Compliance friendly"]));

  items.push(P("Security & audit", "rbac", "Role-based access control", "Decide what a user may do from the roles they hold, checked in one place.",
    ["Different users have different permissions", "You want permission checks to be consistent", "Changes to who may do what should not need code changes"],
    ["User|class|name; roles|", "Role|enum|VIEWER; EDITOR; ADMIN|", "Permission|enum|READ; WRITE; DELETE|", "AccessPolicy|class|grants|allowed(user, permission)", "AuditedGuard|class|policy; audit|require(user, permission)"],
    [["User", "Role", "has", "many"], ["AccessPolicy", "Role", "uses"], ["AccessPolicy", "Permission", "uses"], ["AuditedGuard", "AccessPolicy", "has"], ["AuditedGuard", "User", "uses"]],
    [["Spring Security @PreAuthorize, hasRole", "Declarative checks on methods and URLs."], ["AWS IAM, Kubernetes RBAC", "The same model at infrastructure level."]],
    R`import java.util.*;

enum Role { VIEWER, EDITOR, ADMIN }
enum Permission { READ, WRITE, DELETE }
class User { final String name; final Set<Role> roles; User(String n, Role... r) { name = n; roles = EnumSet.copyOf(Arrays.asList(r)); } }
class AccessPolicy {
  private final Map<Role, Set<Permission>> grants = new EnumMap<>(Role.class);
  AccessPolicy() {
    grants.put(Role.VIEWER, EnumSet.of(Permission.READ));
    grants.put(Role.EDITOR, EnumSet.of(Permission.READ, Permission.WRITE));
    grants.put(Role.ADMIN, EnumSet.allOf(Permission.class));
  }
  boolean allowed(User u, Permission p) { for (Role r : u.roles) if (grants.get(r).contains(p)) return true; return false; }
}
class AuditedGuard {                                                    // one gate for every check, and every decision is recorded
  private final AccessPolicy policy = new AccessPolicy(); final List<String> audit = new ArrayList<>();
  void require(User u, Permission p) {
    boolean ok = policy.allowed(u, p); audit.add((ok ? "ALLOW " : "DENY  ") + u.name + " " + p);
    if (!ok) throw new SecurityException(u.name + " may not " + p);        // default deny
  }
}
public class Main {
  public static void main(String[] a) {
    AuditedGuard guard = new AuditedGuard(); User asha = new User("asha", Role.EDITOR), ravi = new User("ravi", Role.VIEWER);
    guard.require(asha, Permission.WRITE);
    try { guard.require(ravi, Permission.DELETE); } catch (SecurityException e) { System.out.println("blocked: " + e.getMessage()); }
    guard.audit.forEach(System.out::println);
  }
}`,
    [F("RBAC vs ABAC?", "RBAC grants by role and is simple. ABAC decides from attributes (department, time, resource owner), which is more flexible for fine-grained rules. Many systems combine them."), F("Authentication vs authorisation?", "Authentication proves who you are (password, token). Authorisation decides what you may do. Do both on the server; never trust the client."), F("Where should checks live?", "At the service boundary and again close to the data. Deny by default, use least privilege, and log every denial.")],
    ["Consistent permissions", "Role explosion at scale", "Default deny", "Audit every decision"]));

  items.push(P("Security & audit", "jwt", "Token authentication filter (JWT)", "Verify a signed token on every request before any business code runs.",
    ["Stateless APIs behind many servers", "A gateway or filter should authenticate once", "Tokens must expire and be verifiable without a database call"],
    ["AuthFilter|class|verifier|doFilter(request)", "TokenService|class|secret|issue(user, ttl); verify(token)", "Request|class|token; path|"],
    [["AuthFilter", "TokenService", "has"], ["AuthFilter", "Request", "uses"]],
    [["Spring Security OncePerRequestFilter", "The standard place to validate a bearer token."], ["OAuth 2 / OpenID Connect", "Identity providers issue the tokens."]],
    R`import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

class TokenService {
  private final byte[] secret; TokenService(String s) { secret = s.getBytes(StandardCharsets.UTF_8); }
  private String sign(String data) {
    try { Mac m = Mac.getInstance("HmacSHA256"); m.init(new SecretKeySpec(secret, "HmacSHA256")); return Base64.getUrlEncoder().withoutPadding().encodeToString(m.doFinal(data.getBytes(StandardCharsets.UTF_8))); }
    catch (Exception e) { throw new IllegalStateException(e); }
  }
  String issue(String user, long expiresAtSec) { String payload = Base64.getUrlEncoder().withoutPadding().encodeToString((user + "|" + expiresAtSec).getBytes(StandardCharsets.UTF_8)); return payload + "." + sign(payload); }
  Optional<String> verify(String token, long nowSec) {             // returns the user when the signature is valid and the token has not expired
    String[] parts = token == null ? new String[0] : token.split("\\.");
    if (parts.length != 2 || !MessageDigestEq.eq(sign(parts[0]), parts[1])) return Optional.empty();
    String[] body = new String(Base64.getUrlDecoder().decode(parts[0]), StandardCharsets.UTF_8).split("\\|");
    return Long.parseLong(body[1]) > nowSec ? Optional.of(body[0]) : Optional.empty();
  }
}
class MessageDigestEq { static boolean eq(String a, String b) { return java.security.MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8)); } }   // constant-time compare
class AuthFilter {
  private final TokenService tokens; AuthFilter(TokenService t) { tokens = t; }
  String handle(String bearer, String path, long now) {
    Optional<String> user = tokens.verify(bearer == null ? null : bearer.replace("Bearer ", ""), now);
    return user.map(u -> "200 " + path + " for " + u).orElse("401 unauthorised");
  }
}
public class Main {
  public static void main(String[] a) {
    TokenService ts = new TokenService("change-me-32-bytes"); AuthFilter f = new AuthFilter(ts);
    String t = ts.issue("asha", 1000);
    System.out.println(f.handle("Bearer " + t, "/orders", 500));
    System.out.println(f.handle("Bearer " + t, "/orders", 2000));                                    // expired
    System.out.println(f.handle("Bearer " + t.substring(0, t.length() - 2) + "xx", "/orders", 500)); // tampered
    System.out.println(f.handle(null, "/orders", 500));
  }
}`,
    [F("Where should the JWT live in a browser?", "In an HttpOnly, Secure, SameSite cookie is safer against script theft than local storage; add CSRF protection for cookies."), F("How do you revoke a JWT?", "Keep lifetimes short and use refresh tokens, or keep a denylist of token IDs. Stateless tokens cannot be recalled without extra state."), F("Symmetric or asymmetric signing?", "HMAC shares one secret between issuer and verifiers. RS256/ES256 lets services verify with a public key while only the identity provider can sign, which is better across services.")],
    ["Stateless verification", "Hard to revoke", "Keep secrets out of code", "Short lifetimes"]));

  items.push(P("Enterprise & cloud", "strangler", "Strangler Fig", "Replace a legacy system gradually by routing more and more traffic to new services.",
    ["A rewrite in one go is too risky", "You can put a router in front of the old system", "You want to migrate feature by feature"],
    ["Router|class|routes; legacy; modern|handle(path)", "LegacyApp|class||", "ModernService|class||"],
    [["Router", "LegacyApp", "has"], ["Router", "ModernService", "has"]],
    [["API gateways, reverse proxies with path rules", "Route by URL to old or new."], ["Feature flags and canary releases", "Move a percentage of users at a time."]],
    R`import java.util.*;

class LegacyApp { String handle(String path) { return "legacy handled " + path; } }
class ModernService { String handle(String path) { return "modern handled " + path; } }
class Router {
  private final Set<String> migrated = new HashSet<>(); private final LegacyApp legacy = new LegacyApp(); private final ModernService modern = new ModernService();
  void migrate(String prefix) { migrated.add(prefix); }                    // move one feature at a time
  String handle(String path) { for (String p : migrated) if (path.startsWith(p)) return modern.handle(path); return legacy.handle(path); }
}
public class Main {
  public static void main(String[] a) {
    Router r = new Router();
    System.out.println(r.handle("/orders/1")); System.out.println(r.handle("/invoices/9"));
    r.migrate("/orders");                                                   // orders now run on the new service; invoices are still on the old one
    System.out.println(r.handle("/orders/1")); System.out.println(r.handle("/invoices/9"));
  }
}`,
    [F("Why not a big-bang rewrite?", "Big rewrites take long, ship nothing until the end and often fail. The strangler approach delivers value continuously and you can roll back any slice."), F("What about shared data?", "Start with the same database and move data ownership per feature; use change data capture to keep both sides consistent during the move."), F("How do you verify the new service?", "Shadow traffic (send copies to the new one and compare), then a canary percentage, then full cutover.")],
    ["Low-risk migration", "Two systems to run for a while", "Needs a routing layer", "Data sync is the hard part"]));

  return items;
});
