/* Low-level design of the core service of each platform architecture (see platforms.js): layers, patterns and working Java.
 * kind "blueprint": opened from the Blueprint tab, hidden from the lists. Same format as lld_a.js. */
(function (root, factory) { const items = factory(); if (typeof module === "object" && module.exports) module.exports = items; else (root.LabLLDParts = root.LabLLDParts || []).push(...items); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const R = String.raw;
  const B = (id, title, ask, func, classes, rels, seen, code, follow, look) => ({ kind: "blueprint", id, title, ask, func, classes, rels, patterns: seen, code, follow, look });
  const F = (q, a) => ({ q, a });
  const items = [];

  items.push(B("bp-ecom", "Order service internals (e-commerce)", "How is the Order service built inside: layers, checkout saga, outbox, audit and resilience?",
    ["A thin REST controller, an application service, a domain aggregate and a repository", "Checkout is a saga: reserve stock, charge, confirm, with compensation", "Events leave through an outbox; every action is audited"],
    ["OrderController|class|service|post(request, jwt)", "OrderService|class|repo; saga; outbox; audit|placeOrder(cmd)", "Order|class|id; user; state; total|pay(); cancel(); confirm()", "OrderState|enum|CREATED; RESERVED; PAID; CANCELLED|", "OrderRepository|interface||save(o); find(id)", "CheckoutSaga|class|steps|run(order)", "Step|interface||execute(o); compensate(o)", "ReserveStock|class|inventory|", "ChargeCard|class|payments|", "Outbox|class|events|add(e); drain()", "AuditPublisher|class|sink|record(actor, action)", "CircuitBreaker|class|failures|call(op)"],
    [["OrderController", "OrderService", "has"], ["OrderService", "OrderRepository", "has"], ["OrderService", "CheckoutSaga", "has"], ["OrderService", "Outbox", "has"], ["OrderService", "AuditPublisher", "has"], ["OrderRepository", "Order", "uses"], ["Order", "OrderState", "uses"], ["ReserveStock", "Step", "implements"], ["ChargeCard", "Step", "implements"], ["CheckoutSaga", "Step", "has", "ordered"], ["ChargeCard", "CircuitBreaker", "has"]],
    [["Saga (orchestrator)", "CheckoutSaga runs steps and compensates in reverse on failure."], ["Transactional outbox", "OrderPlaced is saved with the order and published later by a relay."], ["State", "Order allows only legal transitions."], ["Circuit breaker", "Protects the payment call."], ["Repository", "Hides storage."]],
    R`import java.util.*;

enum OrderState { CREATED, RESERVED, PAID, CANCELLED }
class Order { final String id, user; final double total; OrderState state = OrderState.CREATED; Order(String id, String user, double total) { this.id = id; this.user = user; this.total = total; } }
interface OrderRepository { void save(Order o); Optional<Order> find(String id); }
class InMemoryOrders implements OrderRepository { final Map<String, Order> m = new HashMap<>(); public void save(Order o) { m.put(o.id, o); } public Optional<Order> find(String id) { return Optional.ofNullable(m.get(id)); } }
interface Step { void execute(Order o); void compensate(Order o); }
class ReserveStock implements Step {
  final Set<String> reserved = new HashSet<>();
  public void execute(Order o) { reserved.add(o.id); o.state = OrderState.RESERVED; System.out.println("  stock reserved"); }
  public void compensate(Order o) { reserved.remove(o.id); System.out.println("  stock released"); }
}
class CircuitBreaker { int failures = 0; <T> T call(java.util.function.Supplier<T> op) { if (failures >= 3) throw new IllegalStateException("payment circuit open"); try { T r = op.get(); failures = 0; return r; } catch (RuntimeException e) { failures++; throw e; } } }
class ChargeCard implements Step {
  final boolean declines; final CircuitBreaker breaker = new CircuitBreaker(); ChargeCard(boolean d) { declines = d; }
  public void execute(Order o) { breaker.call(() -> { if (declines) throw new IllegalStateException("card declined"); return true; }); o.state = OrderState.PAID; System.out.println("  card charged " + o.total); }
  public void compensate(Order o) { if (o.state == OrderState.PAID) System.out.println("  card refunded"); }
}
class CheckoutSaga {
  private final List<Step> steps; CheckoutSaga(List<Step> s) { steps = s; }
  boolean run(Order o) {
    Deque<Step> done = new ArrayDeque<>();
    for (Step s : steps) { try { s.execute(o); done.push(s); } catch (RuntimeException e) { System.out.println("  step failed: " + e.getMessage()); while (!done.isEmpty()) done.pop().compensate(o); o.state = OrderState.CANCELLED; return false; } }
    return true;
  }
}
class Outbox { final List<String> pending = new ArrayList<>(); void add(String e) { pending.add(e); } List<String> drain() { List<String> out = new ArrayList<>(pending); pending.clear(); return out; } }
class AuditPublisher { final List<String> sink = new ArrayList<>(); void record(String actor, String action) { sink.add(actor + " " + action); } }
class OrderService {
  private final OrderRepository repo; private final CheckoutSaga saga; final Outbox outbox = new Outbox(); final AuditPublisher audit = new AuditPublisher(); private int seq = 0;
  OrderService(OrderRepository r, CheckoutSaga s) { repo = r; saga = s; }
  String placeOrder(String jwtUser, double total) {                               // the controller has already verified the JWT and passes the identity
    Order o = new Order("O" + (++seq), jwtUser, total); repo.save(o); audit.record(jwtUser, "PLACE_ORDER " + o.id);
    boolean ok = saga.run(o); repo.save(o);
    outbox.add((ok ? "OrderPlaced " : "OrderCancelled ") + o.id);                 // written in the same transaction as the order in a real system
    audit.record(jwtUser, (ok ? "ORDER_CONFIRMED " : "ORDER_CANCELLED ") + o.id);
    return o.id + " " + o.state;
  }
}
public class Main {
  public static void main(String[] a) {
    OrderService good = new OrderService(new InMemoryOrders(), new CheckoutSaga(List.of(new ReserveStock(), new ChargeCard(false))));
    System.out.println(good.placeOrder("asha", 1200));
    OrderService bad = new OrderService(new InMemoryOrders(), new CheckoutSaga(List.of(new ReserveStock(), new ChargeCard(true))));
    System.out.println(bad.placeOrder("ravi", 500));
    System.out.println("events: " + good.outbox.drain() + " " + bad.outbox.drain());
    System.out.println("audit: " + bad.audit.sink);
  }
}`,
    [F("Why is the saga in the Order service and not a separate orchestrator service?", "The order owns the business transaction, so it is the natural coordinator. A separate workflow engine (Temporal, Camunda) is worth it once flows get long or numerous."), F("Where does the JWT get validated?", "At the gateway and again in the service (a filter before the controller). The controller receives an authenticated principal, never a raw token."), F("How do you test it?", "Unit-test the saga with fake steps (as here), the repository against a real database container, and the whole flow with contract tests between services.")],
    ["Thin controller, rich domain", "Saga with compensations", "Outbox for reliable events", "Audit of every action", "Resilience around the payment call"]));

  items.push(B("bp-bank", "Transfer service internals (digital bank)", "How does the Transfers service move money safely: idempotency, fraud check, ledger and audit trail?",
    ["An idempotency key makes retries safe", "A fraud check with a circuit breaker and a safe fallback", "Two ledger entries posted atomically, and an audit record chained by hash"],
    ["TransferController|class|service|post(key, request)", "TransferService|class|idempotency; fraud; ledger; audit|transfer(key, from, to, amount)", "FraudClient|interface||score(t)", "GuardedFraudClient|class|breaker; fallback|score(t)", "Ledger|class|entries; balances|post(debit, credit, amount)", "IdempotencyStore|class|results|get(key); put(key, r)", "AuditChain|class|entries|append(actor, action)"],
    [["TransferController", "TransferService", "has"], ["TransferService", "IdempotencyStore", "has"], ["TransferService", "FraudClient", "has"], ["TransferService", "Ledger", "has"], ["TransferService", "AuditChain", "has"], ["GuardedFraudClient", "FraudClient", "implements"]],
    [["Idempotency key", "A repeated request returns the first result."], ["Circuit breaker + fallback", "If fraud scoring is slow, simple rules decide."], ["Event sourcing (append-only)", "The ledger only appends entries."], ["Audit trail (hash chain)", "Tampering is detectable."]],
    R`import java.security.MessageDigest;
import java.util.*;

interface FraudClient { double score(String from, double amount); }
class GuardedFraudClient implements FraudClient {                          // decorator: timeout, breaker and a rules fallback around the real model call
  private final FraudClient real; private int failures = 0;
  GuardedFraudClient(FraudClient real) { this.real = real; }
  public double score(String from, double amount) {
    if (failures < 3) { try { return real.score(from, amount); } catch (RuntimeException e) { failures++; } }
    return amount > 10000 ? 0.9 : 0.1;                                      // fallback rule: only very large transfers are risky
  }
}
class Ledger {
  final Map<String, Double> balances = new HashMap<>(); final List<String> entries = new ArrayList<>();
  synchronized void post(String from, String to, double amount) {
    if (balances.getOrDefault(from, 0.0) < amount) throw new IllegalStateException("insufficient funds");
    balances.merge(from, -amount, Double::sum); balances.merge(to, amount, Double::sum);       // both legs or neither
    entries.add("DEBIT " + from + " " + amount); entries.add("CREDIT " + to + " " + amount);
  }
}
class AuditChain {
  final List<String> hashes = new ArrayList<>(); final List<String> lines = new ArrayList<>();
  void append(String actor, String action) {
    String prev = hashes.isEmpty() ? "GENESIS" : hashes.get(hashes.size() - 1), line = actor + "|" + action;
    lines.add(line); hashes.add(sha(prev + line));
  }
  static String sha(String s) { try { byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes("UTF-8")); StringBuilder sb = new StringBuilder(); for (byte b : d) sb.append(String.format("%02x", b)); return sb.substring(0, 10); } catch (Exception e) { throw new IllegalStateException(e); } }
}
class TransferService {
  private final Map<String, String> idempotency = new HashMap<>(); private final FraudClient fraud; final Ledger ledger; final AuditChain audit = new AuditChain();
  TransferService(FraudClient f, Ledger l) { fraud = f; ledger = l; }
  String transfer(String key, String user, String to, double amount) {
    String prior = idempotency.get(key); if (prior != null) return prior + " (replayed)";
    String result;
    if (fraud.score(user, amount) > 0.8) result = "REJECTED (fraud)";
    else { try { ledger.post(user, to, amount); result = "OK"; } catch (IllegalStateException e) { result = "FAILED (" + e.getMessage() + ")"; } }
    idempotency.put(key, result); audit.append(user, "TRANSFER " + amount + " to " + to + " -> " + result); return result;
  }
}
public class Main {
  public static void main(String[] a) {
    Ledger l = new Ledger(); l.balances.put("asha", 5000.0);
    TransferService svc = new TransferService(new GuardedFraudClient((f, amt) -> { throw new RuntimeException("model timeout"); }), l);
    System.out.println(svc.transfer("k1", "asha", "ravi", 1000));
    System.out.println(svc.transfer("k1", "asha", "ravi", 1000));            // client retry: same key
    System.out.println(svc.transfer("k2", "asha", "ravi", 20000));
    System.out.println(svc.transfer("k3", "asha", "ravi", 9000));
    System.out.println(l.balances + " ledger entries " + l.entries.size() + " audit " + svc.audit.hashes.size());
  }
}`,
    [F("Why store the idempotency result instead of just checking for the key?", "So the retry gets exactly the same answer as the first call, including failures, without repeating side effects."), F("How do you keep ledger and audit consistent?", "Write them in one database transaction, or use the outbox so the audit event is emitted only when the ledger commit succeeded."), F("What if two transfers hit the same account at once?", "Lock the account rows in a fixed order, or use optimistic versioning and retry, so balances never go negative and there are no deadlocks.")],
    ["Idempotent by key", "Fraud with breaker and fallback", "Atomic double-entry posting", "Hash-chained audit", "Authenticated identity passed in"]));

  items.push(B("bp-ride", "Trip service internals (ride-hailing)", "How is the Trip service structured: state machine, matching strategy, pricing decorators and events?",
    ["A trip moves through legal states only", "Matching and pricing are pluggable strategies", "State changes are published to observers (notifications, analytics)"],
    ["TripService|class|trips; matcher; pricing; listeners|request(rider, from, to); driverAccepts(id); complete(id)", "Trip|class|id; state; driver; fare|", "TripState|enum|REQUESTED; MATCHED; STARTED; COMPLETED; CANCELLED|", "MatchingStrategy|interface||pick(drivers, from)", "NearestDriver|class||", "PricingStrategy|interface||fare(km)", "BaseFare|class||", "SurgeDecorator|class|inner; multiplier|", "TripListener|interface||onChange(trip)"],
    [["NearestDriver", "MatchingStrategy", "implements"], ["BaseFare", "PricingStrategy", "implements"], ["SurgeDecorator", "PricingStrategy", "implements"], ["SurgeDecorator", "PricingStrategy", "has", "wraps"], ["TripService", "Trip", "has", "many"], ["TripService", "MatchingStrategy", "has"], ["TripService", "PricingStrategy", "has"], ["TripService", "TripListener", "has", "observers"], ["Trip", "TripState", "uses"]],
    [["State machine", "Trip validates every transition."], ["Strategy", "Matching and pricing can change independently."], ["Decorator", "Surge and promotions wrap the base fare."], ["Observer", "Notifications and analytics subscribe to changes."]],
    R`import java.util.*;

enum TripState { REQUESTED, MATCHED, STARTED, COMPLETED, CANCELLED }
class Trip { final String id; TripState state = TripState.REQUESTED; String driver; double fare; Trip(String id) { this.id = id; } }
interface MatchingStrategy { Optional<String> pick(Map<String, Double> driverDistanceKm); }
class NearestDriver implements MatchingStrategy { public Optional<String> pick(Map<String, Double> d) { return d.entrySet().stream().min(Map.Entry.comparingByValue()).map(Map.Entry::getKey); } }
interface PricingStrategy { double fare(double km); }
class BaseFare implements PricingStrategy { public double fare(double km) { return 40 + 12 * km; } }
class SurgeDecorator implements PricingStrategy { private final PricingStrategy inner; private final double m; SurgeDecorator(PricingStrategy i, double m) { inner = i; this.m = m; } public double fare(double km) { return inner.fare(km) * m; } }
interface TripListener { void onChange(Trip t); }
class TripService {
  private final Map<String, Trip> trips = new HashMap<>(); private final MatchingStrategy matcher; private final PricingStrategy pricing; private final List<TripListener> listeners = new ArrayList<>(); private int seq = 0;
  TripService(MatchingStrategy m, PricingStrategy p) { matcher = m; pricing = p; }
  void subscribe(TripListener l) { listeners.add(l); }
  private void move(Trip t, TripState to, TripState... allowedFrom) {
    if (!Arrays.asList(allowedFrom).contains(t.state)) throw new IllegalStateException(t.state + " -> " + to + " is not allowed");
    t.state = to; listeners.forEach(l -> l.onChange(t));
  }
  Trip request(Map<String, Double> nearby) {
    Trip t = new Trip("T" + (++seq)); trips.put(t.id, t); listeners.forEach(l -> l.onChange(t));
    Optional<String> d = matcher.pick(nearby); if (d.isEmpty()) { move(t, TripState.CANCELLED, TripState.REQUESTED); return t; }
    t.driver = d.get(); move(t, TripState.MATCHED, TripState.REQUESTED); return t;
  }
  void start(Trip t) { move(t, TripState.STARTED, TripState.MATCHED); }
  double complete(Trip t, double km) { move(t, TripState.COMPLETED, TripState.STARTED); t.fare = pricing.fare(km); return t.fare; }
}
public class Main {
  public static void main(String[] a) {
    TripService svc = new TripService(new NearestDriver(), new SurgeDecorator(new BaseFare(), 1.5));
    svc.subscribe(t -> System.out.println("  event: trip " + t.id + " is " + t.state + (t.driver != null ? " with " + t.driver : "")));
    Trip t = svc.request(Map.of("d1", 2.5, "d2", 0.8)); svc.start(t); System.out.println("fare " + svc.complete(t, 10));
    try { svc.start(t); } catch (IllegalStateException e) { System.out.println("rejected: " + e.getMessage()); }
  }
}`,
    [F("How do you avoid matching two riders to one driver?", "Reserve the driver atomically (compare-and-set on the driver state in a shared store) before confirming the match."), F("Where does surge come from?", "A separate pricing service computes a multiplier per area from supply and demand; the SurgeDecorator applies it to the base fare."), F("Why publish every state change?", "Notifications, analytics, payments and fraud all react to trip events, and the Trip service should not know about them.")],
    ["Explicit state machine", "Strategies for matching and pricing", "Decorator for surge and promotions", "Observer for downstream systems", "Atomic driver reservation"]));

  items.push(B("bp-food", "Dispatch service internals (food delivery)", "How does Dispatch assign couriers and stay flexible: strategy, commands and observers?",
    ["Assignment logic is a strategy that can change without touching orders", "Each dispatch action is a command (assign, reassign, cancel) that can be logged and undone", "Tracking and notifications observe assignment events"],
    ["DispatchService|class|couriers; strategy; history; observers|dispatch(order)", "AssignmentStrategy|interface||choose(order, couriers)", "NearestFirst|class||", "LeastBusy|class||", "Command|interface||execute(); undo()", "AssignCourier|class|order; courier|", "Courier|class|id; distanceKm; active|", "DispatchObserver|interface||assigned(order, courier)"],
    [["NearestFirst", "AssignmentStrategy", "implements"], ["LeastBusy", "AssignmentStrategy", "implements"], ["AssignCourier", "Command", "implements"], ["DispatchService", "AssignmentStrategy", "has"], ["DispatchService", "Command", "has", "history"], ["DispatchService", "Courier", "has", "many"], ["DispatchService", "DispatchObserver", "has", "observers"]],
    [["Strategy", "Swap assignment rules per city or time."], ["Command", "Assign, reassign and cancel are recorded and reversible."], ["Observer", "Tracking and notifications subscribe."]],
    R`import java.util.*;

class Courier { final String id; final double distanceKm; int active; Courier(String id, double d, int a) { this.id = id; distanceKm = d; active = a; } }
interface AssignmentStrategy { Optional<Courier> choose(String order, List<Courier> couriers); }
class NearestFirst implements AssignmentStrategy { public Optional<Courier> choose(String o, List<Courier> c) { return c.stream().filter(x -> x.active < 3).min(Comparator.comparingDouble(x -> x.distanceKm)); } }
class LeastBusy implements AssignmentStrategy { public Optional<Courier> choose(String o, List<Courier> c) { return c.stream().min(Comparator.comparingInt((Courier x) -> x.active).thenComparingDouble(x -> x.distanceKm)); } }
interface Command { void execute(); void undo(); }
class AssignCourier implements Command {
  final String order; final Courier courier; AssignCourier(String o, Courier c) { order = o; courier = c; }
  public void execute() { courier.active++; } public void undo() { courier.active--; }
}
interface DispatchObserver { void assigned(String order, Courier c); }
class DispatchService {
  private final List<Courier> couriers; private AssignmentStrategy strategy; private final Deque<Command> history = new ArrayDeque<>(); private final List<DispatchObserver> observers = new ArrayList<>();
  DispatchService(List<Courier> c, AssignmentStrategy s) { couriers = c; strategy = s; }
  void useStrategy(AssignmentStrategy s) { strategy = s; } void observe(DispatchObserver o) { observers.add(o); }
  boolean dispatch(String order) {
    Optional<Courier> c = strategy.choose(order, couriers); if (c.isEmpty()) return false;
    Command cmd = new AssignCourier(order, c.get()); cmd.execute(); history.push(cmd); observers.forEach(o -> o.assigned(order, c.get())); return true;
  }
  void undoLast() { if (!history.isEmpty()) history.pop().undo(); }
}
public class Main {
  public static void main(String[] a) {
    List<Courier> cs = List.of(new Courier("c1", 0.8, 2), new Courier("c2", 1.5, 0));
    DispatchService d = new DispatchService(cs, new NearestFirst());
    d.observe((o, c) -> System.out.println("  tracking: " + o + " is with " + c.id));
    d.dispatch("order-1"); d.dispatch("order-2");
    d.useStrategy(new LeastBusy()); d.dispatch("order-3");                       // the rule changed at runtime, the service did not
    d.undoLast(); System.out.println("c1 active " + cs.get(0).active + ", c2 active " + cs.get(1).active);
  }
}`,
    [F("How would you batch orders for one courier?", "Add a BatchingStrategy that groups orders by restaurant and destination within a time window before choosing a courier."), F("What if a courier declines?", "Undo the assignment command and dispatch again excluding that courier; an event tells tracking to reset."), F("Where does the courier location come from?", "The tracking service keeps positions in memory from a stream; dispatch reads them through a query, it does not own them.")],
    ["Strategy swap without redeploy of other services", "Commands are recorded and reversible", "Observers decouple tracking and notifications", "Handles no available courier", "Location owned by tracking"]));

  items.push(B("bp-health", "Record access internals (healthcare)", "How does the Medical Records service decide whether a read is allowed and prove it happened?",
    ["A chain of checks: authenticated, role allowed, patient consent, purpose", "Break-glass emergency access is possible and flagged", "Every decision, allowed or denied, is written to the audit trail"],
    ["RecordService|class|chain; repo; audit|read(user, patientId, purpose)", "AccessCheck|abstract|next|check(request)", "AuthenticatedCheck|class||", "RoleCheck|class||", "ConsentCheck|class|consents|", "BreakGlassCheck|class||", "AccessRequest|class|user; roles; patient; purpose; emergency|", "RecordRepository|interface||find(patientId)", "AuditTrail|class|entries|log(decision)"],
    [["AuthenticatedCheck", "AccessCheck", "extends"], ["RoleCheck", "AccessCheck", "extends"], ["ConsentCheck", "AccessCheck", "extends"], ["BreakGlassCheck", "AccessCheck", "extends"], ["AccessCheck", "AccessCheck", "has", "next"], ["RecordService", "AccessCheck", "has"], ["RecordService", "RecordRepository", "has"], ["RecordService", "AuditTrail", "has"], ["AccessCheck", "AccessRequest", "uses"]],
    [["Chain of responsibility", "Each check can stop the request."], ["Policy (ABAC)", "Consent and purpose are attributes."], ["Decorator (audit)", "The service logs every decision around the read."]],
    R`import java.util.*;

class AccessRequest { final String user, patient, purpose; final Set<String> roles; final boolean emergency; AccessRequest(String u, Set<String> r, String p, String purpose, boolean e) { user = u; roles = r; patient = p; this.purpose = purpose; emergency = e; } }
abstract class AccessCheck {
  private AccessCheck next; AccessCheck then(AccessCheck n) { next = n; return n; }
  String evaluate(AccessRequest r) { String problem = check(r); if (problem != null) return problem; return next == null ? null : next.evaluate(r); }
  protected abstract String check(AccessRequest r);
}
class AuthenticatedCheck extends AccessCheck { protected String check(AccessRequest r) { return r.user == null ? "DENY not authenticated" : null; } }
class RoleCheck extends AccessCheck { protected String check(AccessRequest r) { return r.roles.contains("DOCTOR") || r.roles.contains("NURSE") ? null : "DENY role not allowed"; } }
class ConsentCheck extends AccessCheck {
  final Map<String, Set<String>> consents; ConsentCheck(Map<String, Set<String>> c) { consents = c; }
  protected String check(AccessRequest r) { return consents.getOrDefault(r.patient, Set.of()).contains(r.user) || r.emergency ? null : "DENY no patient consent"; }
}
class BreakGlassCheck extends AccessCheck { protected String check(AccessRequest r) { if (r.emergency) System.out.println("  ALERT break-glass access by " + r.user); return r.emergency && r.purpose.isBlank() ? "DENY emergency needs a reason" : null; } }
class AuditTrail { final List<String> entries = new ArrayList<>(); void log(String user, String patient, String decision) { entries.add(user + " -> " + patient + ": " + decision); } }
class RecordService {
  private final AccessCheck chain; final AuditTrail audit = new AuditTrail(); private final Map<String, String> records = Map.of("p1", "blood pressure 120/80", "p2", "allergy: penicillin");
  RecordService(AccessCheck chain) { this.chain = chain; }
  String read(AccessRequest r) {
    String denial = chain.evaluate(r); audit.log(String.valueOf(r.user), r.patient, denial == null ? "ALLOW" : denial);   // allowed or denied, it is recorded
    return denial == null ? records.get(r.patient) : denial;
  }
}
public class Main {
  public static void main(String[] a) {
    AccessCheck chain = new AuthenticatedCheck(); chain.then(new RoleCheck()).then(new ConsentCheck(Map.of("p1", Set.of("dr-asha")))).then(new BreakGlassCheck());
    RecordService svc = new RecordService(chain);
    System.out.println(svc.read(new AccessRequest("dr-asha", Set.of("DOCTOR"), "p1", "consultation", false)));
    System.out.println(svc.read(new AccessRequest("dr-asha", Set.of("DOCTOR"), "p2", "consultation", false)));
    System.out.println(svc.read(new AccessRequest("dr-asha", Set.of("DOCTOR"), "p2", "unconscious patient", true)));
    System.out.println(svc.read(new AccessRequest("clerk", Set.of("BILLING"), "p1", "billing", false)));
    svc.audit.entries.forEach(e -> System.out.println("audit: " + e));
  }
}`,
    [F("Where is consent stored and cached?", "In the Consent service; the Records service caches decisions briefly and invalidates them on a consent-changed event."), F("How do you audit reads without huge cost?", "Send compact audit events through the bus to append-only storage; index only what investigators search by (user, patient, time)."), F("How is break-glass reviewed?", "It triggers an alert and a mandatory review; abuse shows up in the SIEM as unusual access volume.")],
    ["Ordered checks, fail fast", "Consent enforced on every read", "Break-glass flagged", "Deny and allow both audited", "Audit independent of business code"]));

  items.push(B("bp-ticket", "Booking service internals (ticketing)", "How does Booking turn a seat hold into a confirmed ticket safely under a flash crowd?",
    ["A waiting-room token limits how many users reach checkout", "Seats are held for a short time and confirmed only after payment", "Failures release the seats and refund"],
    ["BookingService|class|waitingRoom; seats; payments|start(user, seatIds); confirm(user)", "WaitingRoom|class|bucket|admit(user)", "SeatInventory|class|seats; holds|hold(user, ids, now); confirm(user); release(user)", "PaymentGateway|interface||charge(user, amount)", "Booking|class|user; seats; state|", "BookingState|enum|HELD; PAID; CANCELLED|"],
    [["BookingService", "WaitingRoom", "has"], ["BookingService", "SeatInventory", "has"], ["BookingService", "PaymentGateway", "uses"], ["BookingService", "Booking", "has", "many"], ["Booking", "BookingState", "uses"]],
    [["Token bucket", "The waiting room admits users at a steady rate."], ["Locking with expiry", "Holds expire, so abandoned carts free seats."], ["Saga", "Hold, pay, confirm, with release and refund on failure."]],
    R`import java.util.*;

class WaitingRoom {
  private double tokens; private final double capacity, perSecond; private long last;
  WaitingRoom(double capacity, double perSecond) { this.capacity = capacity; tokens = capacity; this.perSecond = perSecond; }
  synchronized boolean admit(long nowMs) { tokens = Math.min(capacity, tokens + (nowMs - last) * perSecond / 1000.0); last = nowMs; if (tokens < 1) return false; tokens -= 1; return true; }
}
class SeatInventory {
  private final Map<String, String> holder = new HashMap<>(); private final Map<String, Long> heldUntil = new HashMap<>(); private final Set<String> sold = new HashSet<>(); static final long HOLD_MS = 300_000;
  synchronized boolean hold(String user, List<String> ids, long now) {
    for (String id : ids) { if (sold.contains(id)) return false; String h = holder.get(id); if (h != null && !h.equals(user) && heldUntil.get(id) > now) return false; }   // all or nothing
    for (String id : ids) { holder.put(id, user); heldUntil.put(id, now + HOLD_MS); } return true;
  }
  synchronized List<String> heldBy(String user, long now) { List<String> out = new ArrayList<>(); holder.forEach((id, u) -> { if (u.equals(user) && heldUntil.get(id) > now) out.add(id); }); Collections.sort(out); return out; }
  synchronized void confirm(List<String> ids) { sold.addAll(ids); }
  synchronized void release(String user) { holder.values().removeIf(u -> u.equals(user)); }
}
interface PaymentGateway { boolean charge(String user, double amount); }
class BookingService {
  private final WaitingRoom room; private final SeatInventory seats; private final PaymentGateway pay; final List<String> log = new ArrayList<>();
  BookingService(WaitingRoom r, SeatInventory s, PaymentGateway p) { room = r; seats = s; pay = p; }
  String book(String user, List<String> seatIds, double price, long now) {
    if (!room.admit(now)) return "WAIT: waiting room is full, try again shortly";
    if (!seats.hold(user, seatIds, now)) return "SEATS TAKEN";
    if (!pay.charge(user, price * seatIds.size())) { seats.release(user); log.add("released " + seatIds + " after failed payment"); return "PAYMENT FAILED, seats released"; }
    seats.confirm(seats.heldBy(user, now)); return "CONFIRMED " + seatIds;
  }
}
public class Main {
  public static void main(String[] a) {
    BookingService svc = new BookingService(new WaitingRoom(2, 1), new SeatInventory(), (u, amt) -> !u.equals("ravi"));
    System.out.println(svc.book("asha", List.of("A1", "A2"), 500, 0));
    System.out.println(svc.book("ravi", List.of("A3"), 500, 0));
    System.out.println(svc.book("meena", List.of("A4"), 500, 0));               // third arrival in the same instant: the waiting room is empty
    System.out.println(svc.book("kiran", List.of("A1"), 500, 5000));            // A1 already sold
    System.out.println(svc.log);
  }
}`,
    [F("Why hold first and pay second?", "So the user who reaches payment is guaranteed the seat, and inventory is not locked for long by people who never pay."), F("How does the waiting room stay fair?", "Issue signed tokens in arrival order (randomised within the first seconds to stop bots racing), and let each token expire."), F("What protects the seat database?", "The waiting room and a queue in front, per-user limits, and row-level locking with short transactions.")],
    ["Admission control", "Atomic multi-seat hold with expiry", "Release on payment failure", "No double selling", "Idempotent confirmation"]));

  items.push(B("bp-insure", "Claims service internals (insurance)", "How does a claim move through rules, approvals and payout without losing track?",
    ["A claim is a state machine with durable history", "Approval is a chain: automatic rules, adjuster, manager depending on the amount", "Each step is a command so it can be logged and replayed"],
    ["ClaimService|class|claims; approvals; history|submit(claim); approve(id, by)", "Claim|class|id; amount; state; history|", "ClaimState|enum|SUBMITTED; UNDER_REVIEW; APPROVED; REJECTED; PAID|", "Approver|abstract|next|handle(claim)", "AutoApprover|class|limit|", "AdjusterApprover|class|limit|", "ManagerApprover|class||", "FraudRule|interface||flag(claim)"],
    [["AutoApprover", "Approver", "extends"], ["AdjusterApprover", "Approver", "extends"], ["ManagerApprover", "Approver", "extends"], ["Approver", "Approver", "has", "next"], ["ClaimService", "Claim", "has", "many"], ["ClaimService", "Approver", "has"], ["ClaimService", "FraudRule", "has", "rules"], ["Claim", "ClaimState", "uses"]],
    [["State machine", "Legal transitions only."], ["Chain of responsibility", "Approval limits per level."], ["Strategy (rules)", "Fraud and coverage rules are pluggable."], ["Command", "Each decision is recorded."]],
    R`import java.util.*;

enum ClaimState { SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, PAID }
class Claim { final String id; final double amount; ClaimState state = ClaimState.SUBMITTED; final List<String> history = new ArrayList<>(); Claim(String id, double a) { this.id = id; amount = a; } void to(ClaimState s, String why) { history.add(state + " -> " + s + " (" + why + ")"); state = s; } }
interface FraudRule { boolean flag(Claim c); }
abstract class Approver {
  private Approver next; Approver then(Approver n) { next = n; return n; }
  final void handle(Claim c) { if (canApprove(c)) { c.to(ClaimState.APPROVED, name()); return; } if (next == null) { c.to(ClaimState.REJECTED, "no approver for this amount"); return; } next.handle(c); }
  protected abstract boolean canApprove(Claim c); protected abstract String name();
}
class AutoApprover extends Approver { protected boolean canApprove(Claim c) { return c.amount <= 1000; } protected String name() { return "auto rules"; } }
class AdjusterApprover extends Approver { protected boolean canApprove(Claim c) { return c.amount <= 20000; } protected String name() { return "adjuster"; } }
class ManagerApprover extends Approver { protected boolean canApprove(Claim c) { return c.amount <= 200000; } protected String name() { return "manager"; } }
class ClaimService {
  private final Map<String, Claim> claims = new LinkedHashMap<>(); private final Approver chain; private final List<FraudRule> rules;
  ClaimService(Approver chain, List<FraudRule> rules) { this.chain = chain; this.rules = rules; }
  Claim submit(String id, double amount) {
    Claim c = new Claim(id, amount); claims.put(id, c); c.to(ClaimState.UNDER_REVIEW, "received");
    if (rules.stream().anyMatch(r -> r.flag(c))) { c.to(ClaimState.REJECTED, "flagged by fraud rule"); return c; }
    chain.handle(c); if (c.state == ClaimState.APPROVED) c.to(ClaimState.PAID, "payout scheduled"); return c;
  }
}
public class Main {
  public static void main(String[] a) {
    Approver chain = new AutoApprover(); chain.then(new AdjusterApprover()).then(new ManagerApprover());
    ClaimService svc = new ClaimService(chain, List.of(c -> c.amount == 13.0, c -> c.amount > 150000));
    for (double amount : new double[] { 400, 8000, 90000, 13, 900000 }) { Claim c = svc.submit("C" + (int) amount, amount); System.out.println(c.id + " " + c.state + " " + c.history); }
  }
}`,
    [F("Why is the history part of the claim?", "Claims are audited and disputed; the full sequence of decisions and who or what made them must be reconstructable."), F("Where does the workflow engine fit?", "For long-running human tasks (days) use a workflow engine (Camunda, Temporal) that persists state; this class shows the rules and transitions it would call."), F("How do you keep fraud rules maintainable?", "Rules are small strategies (or data), tested independently, with a shadow mode before they are enforced.")],
    ["Durable claim history", "Approval chain by amount", "Fraud rules as strategies", "Legal state transitions", "Payout only after approval"]));

  items.push(B("bp-hr", "Payroll service internals (multi-tenant SaaS)", "How does Payroll stay correct for many tenants and many countries?",
    ["Every call runs inside a tenant context and repositories always filter by tenant", "The payroll run is a template of fixed steps", "Tax rules per country are strategies"],
    ["PayrollService|class|repo; tax; steps|run(employees)", "TenantContext|class|current|set(t); get()", "EmployeeRepository|class|data|findByTenant()", "TaxStrategy|interface||tax(gross)", "IndiaTax|class||", "GermanyTax|class||", "PayrollRun|abstract||run(); gross(); tax(); net(); payslip()", "MonthlyRun|class||"],
    [["IndiaTax", "TaxStrategy", "implements"], ["GermanyTax", "TaxStrategy", "implements"], ["MonthlyRun", "PayrollRun", "extends"], ["PayrollService", "PayrollRun", "has"], ["PayrollService", "EmployeeRepository", "has"], ["EmployeeRepository", "TenantContext", "uses"], ["PayrollRun", "TaxStrategy", "uses"]],
    [["Multi-tenancy (tenant context)", "The tenant id is set once per request and applied to every query."], ["Template method", "Gross, tax, net and payslip always run in order."], ["Strategy", "One tax strategy per country."]],
    R`import java.util.*;
import java.util.stream.*;

class TenantContext { private static final ThreadLocal<String> current = new ThreadLocal<>(); static void set(String t) { current.set(t); } static String get() { String t = current.get(); if (t == null) throw new IllegalStateException("no tenant in context"); return t; } static void clear() { current.remove(); } }
record Employee(String tenant, String name, String country, double monthlyGross) { }
class EmployeeRepository {
  private final List<Employee> all = new ArrayList<>(); void add(Employee e) { all.add(e); }
  List<Employee> findByTenant() { String t = TenantContext.get(); return all.stream().filter(e -> e.tenant().equals(t)).collect(Collectors.toList()); }   // no query can forget the tenant filter
}
interface TaxStrategy { double tax(double gross); }
class IndiaTax implements TaxStrategy { public double tax(double g) { return g > 50000 ? g * 0.2 : g * 0.05; } }
class GermanyTax implements TaxStrategy { public double tax(double g) { return g * 0.3; } }
abstract class PayrollRun {
  final List<String> run(Employee e) { double gross = e.monthlyGross(), tax = taxFor(e), net = gross - tax; return List.of(e.name() + " gross " + gross + " tax " + tax + " net " + net, payslip(e, net)); }   // the template: fixed order of steps
  protected abstract double taxFor(Employee e); protected String payslip(Employee e, double net) { return "  payslip for " + e.name() + " emailed"; }
}
class MonthlyRun extends PayrollRun {
  private final Map<String, TaxStrategy> byCountry = Map.of("IN", new IndiaTax(), "DE", new GermanyTax());
  protected double taxFor(Employee e) { TaxStrategy s = byCountry.get(e.country()); if (s == null) throw new IllegalArgumentException("no tax rules for " + e.country()); return s.tax(e.monthlyGross()); }
}
class PayrollService {
  private final EmployeeRepository repo; private final PayrollRun run; PayrollService(EmployeeRepository r, PayrollRun run) { repo = r; this.run = run; }
  List<String> runForCurrentTenant() { List<String> out = new ArrayList<>(); for (Employee e : repo.findByTenant()) out.addAll(run.run(e)); return out; }
}
public class Main {
  public static void main(String[] a) {
    EmployeeRepository repo = new EmployeeRepository(); repo.add(new Employee("acme", "Asha", "IN", 80000)); repo.add(new Employee("acme", "Jonas", "DE", 5000)); repo.add(new Employee("globex", "Ravi", "IN", 30000));
    PayrollService svc = new PayrollService(repo, new MonthlyRun());
    TenantContext.set("acme"); svc.runForCurrentTenant().forEach(System.out::println); TenantContext.clear();
    TenantContext.set("globex"); svc.runForCurrentTenant().forEach(System.out::println); TenantContext.clear();
    try { svc.runForCurrentTenant(); } catch (IllegalStateException e) { System.out.println("blocked: " + e.getMessage()); }
  }
}`,
    [F("How do you prevent cross-tenant leaks?", "One place sets the tenant from the verified token; repositories and caches always include it; row-level security in the database is the second line of defence; tests try to read across tenants."), F("How do you run payroll for a huge tenant?", "Split employees into batches processed by workers from a queue, with idempotent per-employee results, and run on capacity separate from interactive traffic."), F("How do you add a country?", "Implement one TaxStrategy and register it; the template and the rest stay untouched.")],
    ["Tenant context enforced centrally", "Template method for the run", "Strategy per country", "Fails safe when tenant missing", "Batch and idempotent runs discussed"]));

  items.push(B("bp-ott", "Playback service internals (video streaming)", "How does Playback decide whether you may watch and hand out the stream safely?",
    ["A chain of checks: session, subscription, region, device limit", "A signed, expiring URL points at the CDN so video bytes never touch the service", "Recommendations are cached with a decorator"],
    ["PlaybackService|class|chain; signer|play(request)", "PlaybackCheck|abstract|next|check(request)", "SessionCheck|class||", "SubscriptionCheck|class|plans|", "RegionCheck|class|licensed|", "DeviceLimitCheck|class|active|", "UrlSigner|class|secret|sign(path, expires)", "Recommender|interface||rows(user)", "CachingRecommender|class|inner; cache|rows(user)"],
    [["SessionCheck", "PlaybackCheck", "extends"], ["SubscriptionCheck", "PlaybackCheck", "extends"], ["RegionCheck", "PlaybackCheck", "extends"], ["DeviceLimitCheck", "PlaybackCheck", "extends"], ["PlaybackCheck", "PlaybackCheck", "has", "next"], ["PlaybackService", "PlaybackCheck", "has"], ["PlaybackService", "UrlSigner", "has"], ["CachingRecommender", "Recommender", "implements"]],
    [["Chain of responsibility", "Entitlement checks in a fixed order."], ["Proxy (signed URL)", "The client gets a time-limited URL to the CDN."], ["Decorator", "Caching wraps the recommender."]],
    R`import java.nio.charset.StandardCharsets;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

class PlayRequest { final String user, title, region, device; PlayRequest(String u, String t, String r, String d) { user = u; title = t; region = r; device = d; } }
abstract class PlaybackCheck {
  private PlaybackCheck next; PlaybackCheck then(PlaybackCheck n) { next = n; return n; }
  String verify(PlayRequest r) { String problem = check(r); return problem != null || next == null ? problem : next.verify(r); }
  protected abstract String check(PlayRequest r);
}
class SessionCheck extends PlaybackCheck { protected String check(PlayRequest r) { return r.user == null ? "401 sign in first" : null; } }
class SubscriptionCheck extends PlaybackCheck { final Set<String> active; SubscriptionCheck(Set<String> a) { active = a; } protected String check(PlayRequest r) { return active.contains(r.user) ? null : "402 subscription required"; } }
class RegionCheck extends PlaybackCheck { final Map<String, Set<String>> licensed; RegionCheck(Map<String, Set<String>> l) { licensed = l; } protected String check(PlayRequest r) { return licensed.getOrDefault(r.title, Set.of()).contains(r.region) ? null : "451 not available in your region"; } }
class DeviceLimitCheck extends PlaybackCheck { final Map<String, Set<String>> devices = new HashMap<>(); protected String check(PlayRequest r) { Set<String> d = devices.computeIfAbsent(r.user, k -> new HashSet<>()); d.add(r.device); return d.size() > 2 ? "429 too many devices" : null; } }
class UrlSigner {
  private final byte[] secret; UrlSigner(String s) { secret = s.getBytes(StandardCharsets.UTF_8); }
  String sign(String path, long expires) { try { Mac m = Mac.getInstance("HmacSHA256"); m.init(new SecretKeySpec(secret, "HmacSHA256")); String sig = Base64.getUrlEncoder().withoutPadding().encodeToString(m.doFinal((path + expires).getBytes(StandardCharsets.UTF_8))); return "https://cdn.example.com" + path + "?exp=" + expires + "&sig=" + sig.substring(0, 12); } catch (Exception e) { throw new IllegalStateException(e); } }
}
class PlaybackService {
  private final PlaybackCheck chain; private final UrlSigner signer; PlaybackService(PlaybackCheck c, UrlSigner s) { chain = c; signer = s; }
  String play(PlayRequest r, long nowSec) { String problem = chain.verify(r); return problem != null ? problem : signer.sign("/video/" + r.title + "/master.m3u8", nowSec + 300); }   // 5 minute URL
}
interface Recommender { List<String> rows(String user); }
class CachingRecommender implements Recommender { final Recommender inner; final Map<String, List<String>> cache = new HashMap<>(); int misses = 0; CachingRecommender(Recommender r) { inner = r; } public List<String> rows(String u) { return cache.computeIfAbsent(u, k -> { misses++; return inner.rows(k); }); } }
public class Main {
  public static void main(String[] a) {
    PlaybackCheck chain = new SessionCheck(); chain.then(new SubscriptionCheck(Set.of("asha"))).then(new RegionCheck(Map.of("dune", Set.of("IN", "US")))).then(new DeviceLimitCheck());
    PlaybackService svc = new PlaybackService(chain, new UrlSigner("cdn-secret"));
    System.out.println(svc.play(new PlayRequest("asha", "dune", "IN", "tv"), 1000));
    System.out.println(svc.play(new PlayRequest("asha", "dune", "DE", "tv"), 1000));
    System.out.println(svc.play(new PlayRequest("ravi", "dune", "IN", "tv"), 1000));
    CachingRecommender rec = new CachingRecommender(u -> List.of("Because you watched Dune"));
    rec.rows("asha"); rec.rows("asha"); System.out.println("recommender computed " + rec.misses + " time for two requests");
  }
}`,
    [F("Why not stream through the service?", "Video is enormous. Signed CDN URLs keep the control plane small and let the CDN scale independently; the service only decides who may play."), F("How do you stop URL sharing?", "Short expiry, binding the token to device or IP, and concurrent stream limits."), F("How is DRM added?", "After the checks the service asks the licence service for a key and returns a licence URL together with the manifest.")],
    ["Ordered entitlement checks", "Signed expiring CDN URL", "Device and region rules", "Caching decorator for recommendations", "Control plane separated from data plane"]));

  items.push(B("bp-logi", "Order & routing internals (logistics, on premises)", "How are Order, Warehouse and Route planning structured in a classic Java deployment?",
    ["Order life cycle as a state machine with a transactional outbox to Kafka", "Route planning is a strategy with a template for the common steps", "Partner integrations sit behind an adapter with a circuit breaker"],
    ["OrderService|class|orders; outbox; planner|accept(order); dispatch(id)", "ShipmentState|enum|ACCEPTED; PICKED; IN_TRANSIT; DELIVERED|", "RoutePlanner|abstract||plan(stops)", "ShortestPath|class||", "FewestStops|class||", "CarrierAdapter|interface||book(shipment)", "LegacyCarrierApi|class||", "OutboxRelay|class|outbox|publish()"],
    [["ShortestPath", "RoutePlanner", "extends"], ["FewestStops", "RoutePlanner", "extends"], ["OrderService", "RoutePlanner", "has"], ["OrderService", "CarrierAdapter", "has"], ["LegacyCarrierApi", "CarrierAdapter", "implements"], ["OrderService", "OutboxRelay", "has"], ["OrderService", "ShipmentState", "uses"]],
    [["Template method", "The planner fixes the steps, subclasses choose the rule."], ["Adapter", "The partner API is wrapped to our interface."], ["Transactional outbox", "Events reach Kafka reliably."], ["State", "Shipment life cycle."]],
    R`import java.util.*;

enum ShipmentState { ACCEPTED, PICKED, IN_TRANSIT, DELIVERED }
abstract class RoutePlanner {
  final List<String> plan(List<String> stops) { List<String> cleaned = new ArrayList<>(new LinkedHashSet<>(stops)); return order(cleaned); }   // template: de-duplicate, then order
  protected abstract List<String> order(List<String> stops);
}
class ShortestPath extends RoutePlanner { final Map<String, Integer> km; ShortestPath(Map<String, Integer> km) { this.km = km; } protected List<String> order(List<String> s) { List<String> r = new ArrayList<>(s); r.sort(Comparator.comparingInt(x -> km.getOrDefault(x, 999))); return r; } }
class FewestStops extends RoutePlanner { protected List<String> order(List<String> s) { return s; } }
interface CarrierAdapter { String book(String shipment); }
class LegacyCarrierApi { String createConsignmentXml(String ref) { return "<consignment ref='" + ref + "'/>"; } }
class LegacyAdapter implements CarrierAdapter { final LegacyCarrierApi api = new LegacyCarrierApi(); int failures = 0; public String book(String s) { if (failures >= 2) return "carrier unavailable, queued for retry"; return api.createConsignmentXml(s); } }
class OrderService {
  private final Map<String, ShipmentState> state = new LinkedHashMap<>(); final List<String> outbox = new ArrayList<>(); private final RoutePlanner planner; private final CarrierAdapter carrier;
  OrderService(RoutePlanner p, CarrierAdapter c) { planner = p; carrier = c; }
  void accept(String id) { state.put(id, ShipmentState.ACCEPTED); outbox.add("OrderAccepted " + id); }
  void advance(String id) { ShipmentState s = state.get(id); if (s == ShipmentState.DELIVERED) throw new IllegalStateException("already delivered"); ShipmentState n = ShipmentState.values()[s.ordinal() + 1]; state.put(id, n); outbox.add(n + " " + id); }
  String dispatch(String id, List<String> stops) { List<String> route = planner.plan(stops); return id + " route " + route + " booked as " + carrier.book(id); }
  List<String> relay() { List<String> out = new ArrayList<>(outbox); outbox.clear(); return out; }
}
public class Main {
  public static void main(String[] a) {
    OrderService svc = new OrderService(new ShortestPath(Map.of("Pune", 150, "Nashik", 200, "Mumbai", 0)), new LegacyAdapter());
    svc.accept("S1"); svc.advance("S1"); System.out.println(svc.dispatch("S1", List.of("Nashik", "Mumbai", "Pune", "Mumbai")));
    svc.advance("S1"); svc.advance("S1"); try { svc.advance("S1"); } catch (IllegalStateException e) { System.out.println("rejected: " + e.getMessage()); }
    System.out.println("published to Kafka: " + svc.relay());
  }
}`,
    [F("Why keep separate services if Tomcat hosts them all?", "Separate deployable units keep ownership clear and let you scale, release and fail them independently even on shared servers."), F("How would you move this to containers later?", "Strangler approach: route one capability at a time to the new container platform through the gateway, keeping the same events and APIs."), F("How do you deploy without downtime on fixed servers?", "Rolling restarts behind HAProxy with health checks, draining connections, and backward-compatible database changes.")],
    ["State machine for shipments", "Planner as template plus strategy", "Adapter for legacy partners", "Outbox to Kafka", "Deployment realities of servers discussed"]));

  return items;
});
