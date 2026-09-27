/* Design patterns (classic GoF), with a class diagram and working Java each.
 * Same format as lld_a.js plus kind "pattern" and a group. `func` = when to use it, `patterns` = where you have seen it (JDK, Spring), `look` = trade-offs. */
(function (root, factory) { const items = factory(); if (typeof module === "object" && module.exports) module.exports = items; else (root.LabLLDParts = root.LabLLDParts || []).push(...items); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const R = String.raw;
  const P = (group, id, title, ask, func, classes, rels, seen, code, follow, tradeoffs) => ({ kind: "pattern", group, id, title, ask, func, classes, rels, patterns: seen, code, follow, look: tradeoffs });
  const F = (q, a) => ({ q, a });
  const items = [];

  // ---------------------------------------------------------------- creational
  items.push(P("Creational", "singleton", "Singleton", "Make sure a class has exactly one instance and give everyone a way to get it.",
    ["A shared resource: configuration, connection pool, logger", "Creating a second instance would be a bug", "You need lazy creation that is thread safe"],
    ["Config|class|instance; values|getInstance(); get(key)", "Registry|enum|INSTANCE; items|"], [["Registry", "Config", "uses", "alternative"]],
    [["java.lang.Runtime.getRuntime()", "One runtime per JVM."], ["Spring beans", "Beans are singletons per container by default; prefer this to hand-written singletons."]],
    R`import java.util.*;

class Config {
  private static volatile Config instance;                      // volatile makes double-checked locking safe
  private final Map<String, String> values = new HashMap<>();
  private Config() { values.put("env", "prod"); System.out.println("Config created"); }
  static Config getInstance() {
    if (instance == null) { synchronized (Config.class) { if (instance == null) instance = new Config(); } }
    return instance;
  }
  String get(String k) { return values.get(k); }
}
enum Registry { INSTANCE; final Map<String, Object> items = new HashMap<>(); }   // the simplest safe singleton: an enum
public class Main {
  public static void main(String[] a) {
    System.out.println(Config.getInstance() == Config.getInstance());
    System.out.println(Config.getInstance().get("env"));
    Registry.INSTANCE.items.put("x", 1); System.out.println(Registry.INSTANCE.items);
  }
}`,
    [F("Why is Singleton often called an anti-pattern?", "It is global state: hard to test (you cannot replace it), hides dependencies, and causes trouble with threads and class loaders. Prefer dependency injection with a single-instance scope."), F("How do you make it thread safe?", "Use an enum, a static holder class, or double-checked locking with a volatile field."), F("Can serialization or reflection break it?", "Yes. An enum singleton is immune; otherwise implement readResolve and guard the constructor.")],
    ["Easy global access", "Hard to test and mock", "Hidden coupling", "Use DI scopes instead when possible"]));

  items.push(P("Creational", "factory", "Factory Method", "Let a method decide which concrete class to create so callers depend only on an interface.",
    ["The exact class is chosen from input or configuration", "You want callers not to use new on concrete classes", "New types should be addable without changing callers"],
    ["Notifier|interface||send(msg)", "EmailNotifier|class||", "SmsNotifier|class||", "PushNotifier|class||", "NotifierFactory|class||create(type)"],
    [["EmailNotifier", "Notifier", "implements"], ["SmsNotifier", "Notifier", "implements"], ["PushNotifier", "Notifier", "implements"], ["NotifierFactory", "Notifier", "uses", "creates"]],
    [["Calendar.getInstance(), List.of()", "Static factory methods return the right implementation."], ["Spring BeanFactory", "Creates beans by name or type."]],
    R`import java.util.*;

interface Notifier { void send(String msg); }
class EmailNotifier implements Notifier { public void send(String m) { System.out.println("email: " + m); } }
class SmsNotifier implements Notifier { public void send(String m) { System.out.println("sms: " + m); } }
class PushNotifier implements Notifier { public void send(String m) { System.out.println("push: " + m); } }
class NotifierFactory {
  private static final Map<String, java.util.function.Supplier<Notifier>> registry = new HashMap<>();
  static { registry.put("email", EmailNotifier::new); registry.put("sms", SmsNotifier::new); registry.put("push", PushNotifier::new); }
  static void register(String type, java.util.function.Supplier<Notifier> s) { registry.put(type, s); }   // new types without editing callers
  static Notifier create(String type) {
    var s = registry.get(type); if (s == null) throw new IllegalArgumentException("unknown type " + type); return s.get();
  }
}
public class Main {
  public static void main(String[] a) {
    NotifierFactory.create("sms").send("your code is 4821");
    NotifierFactory.register("slack", () -> m -> System.out.println("slack: " + m));
    NotifierFactory.create("slack").send("deploy finished");
  }
}`,
    [F("Factory Method vs Abstract Factory?", "Factory Method creates one product through a method (often overridden in a subclass). Abstract Factory creates families of related products so they match (for example a Windows or Mac widget set)."), F("Factory vs plain new?", "new couples the caller to a concrete class. A factory centralises the decision so one place changes when the choice changes."), F("How does Spring replace this?", "Dependency injection picks the implementation by configuration or profile, so most hand-written factories disappear.")],
    ["Decouples callers from concrete types", "Adds an indirection", "Registry needs care with thread safety", "Often replaced by DI"]));

  items.push(P("Creational", "abstractfactory", "Abstract Factory", "Create families of related objects that must be used together.",
    ["Products come in matching sets (cloud provider kits, UI themes)", "Mixing products from different families would be an error", "You switch the whole family in one place"],
    ["CloudFactory|interface||storage(); queue()", "AwsFactory|class||", "GcpFactory|class||", "Storage|interface||put(k, v)", "Queue|interface||push(m)", "S3Storage|class||", "GcsStorage|class||", "Sqs|class||", "PubSub|class||"],
    [["AwsFactory", "CloudFactory", "implements"], ["GcpFactory", "CloudFactory", "implements"], ["S3Storage", "Storage", "implements"], ["GcsStorage", "Storage", "implements"], ["Sqs", "Queue", "implements"], ["PubSub", "Queue", "implements"], ["CloudFactory", "Storage", "uses", "creates"], ["CloudFactory", "Queue", "uses", "creates"]],
    [["javax.xml.parsers.DocumentBuilderFactory", "Creates a matching family of XML parsing objects."], ["Cloud SDK design", "One provider factory yields storage, queue and secrets clients that work together."]],
    R`interface Storage { void put(String k, String v); }
interface Queue { void push(String m); }
interface CloudFactory { Storage storage(); Queue queue(); }
class S3Storage implements Storage { public void put(String k, String v) { System.out.println("S3 put " + k); } }
class GcsStorage implements Storage { public void put(String k, String v) { System.out.println("GCS put " + k); } }
class Sqs implements Queue { public void push(String m) { System.out.println("SQS send " + m); } }
class PubSub implements Queue { public void push(String m) { System.out.println("Pub/Sub publish " + m); } }
class AwsFactory implements CloudFactory { public Storage storage() { return new S3Storage(); } public Queue queue() { return new Sqs(); } }
class GcpFactory implements CloudFactory { public Storage storage() { return new GcsStorage(); } public Queue queue() { return new PubSub(); } }
class App {
  private final Storage storage; private final Queue queue;
  App(CloudFactory f) { storage = f.storage(); queue = f.queue(); }     // the app never names a provider
  void run() { storage.put("report.pdf", "..."); queue.push("report ready"); }
}
public class Main {
  public static void main(String[] a) {
    new App(new AwsFactory()).run();
    new App(new GcpFactory()).run();
  }
}`,
    [F("When is it overkill?", "When you have one product or one family. It adds many interfaces; use it only when families must stay consistent."), F("What is the downside when adding a product?", "Adding a new product type (for example Secrets) means changing the factory interface and every family."), F("How does it relate to multi-cloud design?", "It is the code-level version of swapping AWS services for Google or Azure ones behind stable interfaces.")],
    ["Guarantees matching families", "Many small classes", "Hard to add new product kinds", "Great for portability"]));

  items.push(P("Creational", "builder", "Builder", "Build a complex object step by step, especially with many optional parts.",
    ["A constructor would need many parameters, many optional", "You want immutable objects that are always valid", "Readable construction: name each value"],
    ["HttpRequest|class|url; method; headers; body; timeoutMs|", "Builder|class|fields|url(u); header(k, v); body(b); build()"],
    [["Builder", "HttpRequest", "uses", "builds"]],
    [["StringBuilder, Stream.Builder", "Step-by-step construction."], ["Lombok @Builder, HttpRequest.newBuilder()", "The fluent style used across Java."]],
    R`import java.util.*;

final class HttpRequest {
  final String url, method, body; final Map<String, String> headers; final int timeoutMs;
  private HttpRequest(Builder b) { url = b.url; method = b.method; body = b.body; headers = Map.copyOf(b.headers); timeoutMs = b.timeoutMs; }
  static Builder builder(String url) { return new Builder(url); }
  static class Builder {
    private final String url; private String method = "GET", body; private final Map<String, String> headers = new LinkedHashMap<>(); private int timeoutMs = 3000;
    private Builder(String url) { this.url = url; }
    Builder method(String m) { method = m; return this; }
    Builder header(String k, String v) { headers.put(k, v); return this; }
    Builder body(String b) { body = b; return this; }
    Builder timeoutMs(int t) { timeoutMs = t; return this; }
    HttpRequest build() {
      if (url == null || url.isBlank()) throw new IllegalStateException("url required");
      if (body != null && method.equals("GET")) throw new IllegalStateException("GET cannot have a body");     // validate once, at the end
      return new HttpRequest(this);
    }
  }
  public String toString() { return method + " " + url + " " + headers + " timeout=" + timeoutMs; }
}
public class Main {
  public static void main(String[] a) {
    HttpRequest r = HttpRequest.builder("https://api.example.com/orders").method("POST").header("Authorization", "Bearer x").body("{}").timeoutMs(500).build();
    System.out.println(r);
    try { HttpRequest.builder("https://x").body("oops").build(); } catch (IllegalStateException e) { System.out.println("rejected: " + e.getMessage()); }
  }
}`,
    [F("Builder vs telescoping constructors or setters?", "Telescoping constructors are unreadable; setters make objects mutable and possibly half-built. A builder gives named steps and one validation point, and the result can be immutable."), F("What is a Director?", "A class that knows a standard recipe of builder calls; optional and rarely needed."), F("Records and Builder?", "Java records give immutable data with a canonical constructor; a builder is still useful when there are many optional fields.")],
    ["Readable creation", "Immutable results", "More code to write (Lombok helps)", "Validation in one place"]));

  // ---------------------------------------------------------------- structural
  items.push(P("Structural", "adapter", "Adapter", "Make one interface look like another so incompatible classes can work together.",
    ["You must use a third-party or legacy class with a different interface", "You want your code to depend on your own interface", "Swapping the vendor later should be easy"],
    ["PaymentGateway|interface||charge(cents)", "StripeAdapter|class|client|charge(cents)", "LegacyBankApi|class||makePayment(dollars, currency)"],
    [["StripeAdapter", "PaymentGateway", "implements"], ["StripeAdapter", "LegacyBankApi", "has", "wraps"]],
    [["Arrays.asList(), InputStreamReader", "Adapt arrays to lists and byte streams to character streams."], ["Spring HandlerAdapter", "Lets the dispatcher call any kind of controller."]],
    R`interface PaymentGateway { boolean charge(long cents); }
class LegacyBankApi {                                            // cannot be changed: it belongs to someone else
  String makePayment(double dollars, String currency) { return "OK:" + dollars + currency; }
}
class BankAdapter implements PaymentGateway {
  private final LegacyBankApi bank;
  BankAdapter(LegacyBankApi bank) { this.bank = bank; }
  public boolean charge(long cents) { return bank.makePayment(cents / 100.0, "USD").startsWith("OK"); }   // translate units and results
}
public class Main {
  public static void main(String[] a) {
    PaymentGateway gw = new BankAdapter(new LegacyBankApi());     // the rest of the code only knows PaymentGateway
    System.out.println("charged: " + gw.charge(2599));
  }
}`,
    [F("Adapter vs Facade vs Proxy?", "Adapter changes an interface to a different one. Facade offers a simpler interface to a whole subsystem. Proxy keeps the same interface and controls access."), F("Anti-corruption layer?", "A larger adapter at a service boundary that keeps a foreign model from leaking into yours (a Domain-Driven Design idea)."), F("Object vs class adapter?", "Object adapters wrap by composition (preferred); class adapters inherit, which Java limits.")],
    ["Isolates vendor code", "One more layer", "Easy to test with a fake", "Keeps your domain clean"]));

  items.push(P("Structural", "decorator", "Decorator", "Add behaviour to an object dynamically by wrapping it, without changing its class.",
    ["Optional features that can be combined in any order", "Subclassing every combination would explode", "Cross-cutting behaviour such as logging, caching, retry"],
    ["DataSource|interface||read()", "FileSource|class||", "SourceDecorator|abstract|inner|read()", "CachingSource|class||", "LoggingSource|class||", "EncryptedSource|class||"],
    [["FileSource", "DataSource", "implements"], ["SourceDecorator", "DataSource", "implements"], ["CachingSource", "SourceDecorator", "extends"], ["LoggingSource", "SourceDecorator", "extends"], ["EncryptedSource", "SourceDecorator", "extends"], ["SourceDecorator", "DataSource", "has", "wraps"]],
    [["java.io streams", "new BufferedReader(new InputStreamReader(...)) wraps behaviour on behaviour."], ["Collections.unmodifiableList, Servlet filters", "Wrap to add restrictions or processing."]],
    R`interface DataSource { String read(); }
class FileSource implements DataSource { public String read() { System.out.println("  reading from disk"); return "secret data"; } }
abstract class SourceDecorator implements DataSource { protected final DataSource inner; SourceDecorator(DataSource d) { inner = d; } }
class CachingSource extends SourceDecorator {
  private String cached; CachingSource(DataSource d) { super(d); }
  public String read() { if (cached == null) cached = inner.read(); return cached; }
}
class LoggingSource extends SourceDecorator {
  LoggingSource(DataSource d) { super(d); }
  public String read() { long t = System.nanoTime(); String r = inner.read(); System.out.println("  read took " + (System.nanoTime() - t) / 1000 + " us"); return r; }
}
class EncryptedSource extends SourceDecorator {
  EncryptedSource(DataSource d) { super(d); }
  public String read() { return new StringBuilder(inner.read()).reverse().toString(); }   // stand-in for decryption
}
public class Main {
  public static void main(String[] a) {
    DataSource s = new CachingSource(new LoggingSource(new EncryptedSource(new FileSource())));   // order matters
    System.out.println(s.read()); System.out.println(s.read());                                     // second read is served from the cache
  }
}`,
    [F("Decorator vs inheritance?", "Inheritance fixes behaviour at compile time and multiplies classes for combinations. Decorators combine at runtime by wrapping."), F("Decorator vs Proxy?", "They look alike. A decorator adds responsibilities the client chooses; a proxy controls access to the same object (lazy loading, security, remote)."), F("Where do Spring and AOP fit?", "Aspects (logging, transactions, caching) are decorators applied automatically through proxies.")],
    ["Flexible combinations", "Many small objects", "Order of wrapping matters", "Debugging through layers is harder"]));

  items.push(P("Structural", "facade", "Facade", "Give a simple interface to a complicated subsystem.",
    ["A workflow touches many classes or services", "You want a single entry point for clients", "You want to hide subsystem details and reduce coupling"],
    ["OrderFacade|class|inventory; payment; shipping; email|placeOrder(...)", "Inventory|class||", "Payment|class||", "Shipping|class||", "EmailService|class||"],
    [["OrderFacade", "Inventory", "has"], ["OrderFacade", "Payment", "has"], ["OrderFacade", "Shipping", "has"], ["OrderFacade", "EmailService", "has"]],
    [["Spring JdbcTemplate, service layer", "One call hides connection, statement and cleanup."], ["API gateway", "A facade for many microservices."]],
    R`class Inventory { boolean reserve(String sku, int qty) { System.out.println("  reserved " + qty + " x " + sku); return true; } }
class Payment { boolean charge(String user, double amount) { System.out.println("  charged " + user + " " + amount); return true; } }
class Shipping { String ship(String user, String sku) { System.out.println("  shipping " + sku + " to " + user); return "TRACK-1"; } }
class EmailService { void send(String user, String text) { System.out.println("  email to " + user + ": " + text); } }
class OrderFacade {
  private final Inventory inventory = new Inventory(); private final Payment payment = new Payment(); private final Shipping shipping = new Shipping(); private final EmailService email = new EmailService();
  String placeOrder(String user, String sku, int qty, double price) {       // the client makes one call instead of four
    if (!inventory.reserve(sku, qty)) return "out of stock";
    if (!payment.charge(user, qty * price)) return "payment failed";
    String tracking = shipping.ship(user, sku); email.send(user, "Order shipped: " + tracking); return tracking;
  }
}
public class Main { public static void main(String[] a) { System.out.println(new OrderFacade().placeOrder("asha", "BOOK-7", 2, 499.0)); } }`,
    [F("Facade vs Mediator?", "A facade simplifies access one-way to a subsystem that does not know about it. A mediator coordinates two-way communication between peers."), F("Does a facade hide the subsystem completely?", "No, advanced clients can still use the classes directly; the facade only offers the easy path."), F("What about failures in the middle?", "A facade that spans services needs compensation (a saga): if payment fails after reserving stock, release the stock.")],
    ["Simple entry point", "Can become a god class", "Reduces coupling", "Needs a plan for partial failure"]));

  items.push(P("Structural", "proxy", "Proxy", "Provide a stand-in that controls access to another object.",
    ["Lazy loading of something expensive", "Access control or caching in front of a real service", "A local stand-in for a remote object"],
    ["Image|interface||show()", "RealImage|class|file|show()", "ImageProxy|class|file; real|show()"],
    [["RealImage", "Image", "implements"], ["ImageProxy", "Image", "implements"], ["ImageProxy", "RealImage", "has", "lazy"]],
    [["JDK dynamic proxies, Spring AOP", "Transactions, security and caching are added through proxies."], ["Hibernate lazy loading", "Related entities load only when first touched."]],
    R`import java.lang.reflect.*;

interface Image { void show(); }
class RealImage implements Image {
  private final String file; RealImage(String f) { file = f; System.out.println("  loading " + f + " from disk (slow)"); }
  public void show() { System.out.println("  showing " + file); }
}
class ImageProxy implements Image {                                // virtual proxy: create the real thing only when needed
  private final String file; private RealImage real;
  ImageProxy(String f) { file = f; }
  public void show() { if (real == null) real = new RealImage(file); real.show(); }
}
interface Service { String call(String user); }
public class Main {
  public static void main(String[] a) {
    Image img = new ImageProxy("photo.png"); System.out.println("proxy created, nothing loaded yet"); img.show(); img.show();
    Service real = user -> "hello " + user;                          // a protection proxy built with the JDK: checks access before every call
    Service guarded = (Service) Proxy.newProxyInstance(Service.class.getClassLoader(), new Class<?>[] { Service.class }, (p, m, args) -> {
      if ("guest".equals(args[0])) throw new SecurityException("guest not allowed");
      return m.invoke(real, args);
    });
    System.out.println(guarded.call("asha"));
    try { guarded.call("guest"); } catch (SecurityException e) { System.out.println("blocked: " + e.getMessage()); }
  }
}`,
    [F("Types of proxy?", "Virtual (lazy), protection (access control), remote (local stand-in for a remote object), caching, and logging proxies."), F("JDK proxy vs CGLIB?", "JDK proxies work through interfaces; CGLIB generates subclasses so classes without interfaces can be proxied (Spring uses both). Final classes and methods cannot be subclassed."), F("Pitfall with Spring proxies?", "Calling a method on this bypasses the proxy, so annotations like @Transactional or @Cacheable do nothing on self-calls.")],
    ["Adds control without changing the class", "Extra indirection", "Self-call surprise in Spring", "Powers AOP"]));

  // ---------------------------------------------------------------- behavioral
  items.push(P("Behavioral", "strategy", "Strategy", "Define a family of algorithms, make them interchangeable, and choose one at runtime.",
    ["Several ways to do the same job (pricing, sorting, routing)", "You would otherwise have a big if or switch on a type", "The choice changes at runtime or per customer"],
    ["Checkout|class|discount|total(amount)", "DiscountStrategy|interface||apply(amount)", "NoDiscount|class||", "PercentDiscount|class||", "FlatDiscount|class||"],
    [["NoDiscount", "DiscountStrategy", "implements"], ["PercentDiscount", "DiscountStrategy", "implements"], ["FlatDiscount", "DiscountStrategy", "implements"], ["Checkout", "DiscountStrategy", "has"]],
    [["Comparator, Collections.sort", "The comparator is the strategy."], ["Spring Security PasswordEncoder, load balancer rules", "Pluggable algorithms behind an interface."]],
    R`interface DiscountStrategy { double apply(double amount); }
class NoDiscount implements DiscountStrategy { public double apply(double a) { return a; } }
class PercentDiscount implements DiscountStrategy { private final double pct; PercentDiscount(double p) { pct = p; } public double apply(double a) { return a * (1 - pct / 100); } }
class FlatDiscount implements DiscountStrategy { private final double off; FlatDiscount(double o) { off = o; } public double apply(double a) { return Math.max(0, a - off); } }
class Checkout {
  private DiscountStrategy strategy = new NoDiscount();
  void use(DiscountStrategy s) { strategy = s; }
  double total(double amount) { return strategy.apply(amount); }
}
public class Main {
  public static void main(String[] a) {
    Checkout c = new Checkout(); System.out.println(c.total(1000));
    c.use(new PercentDiscount(10)); System.out.println(c.total(1000));
    c.use(new FlatDiscount(150)); System.out.println(c.total(1000));
    c.use(x -> x > 500 ? x - 100 : x); System.out.println(c.total(1000));     // a lambda is a strategy too
  }
}`,
    [F("Strategy vs State?", "Both swap behaviour behind an interface. Strategy is chosen by the client and stays until changed; State changes itself as the object moves through its life cycle."), F("Strategy vs if/else?", "A growing chain of conditions breaks the open/closed principle. Strategies let you add a case without editing the caller."), F("How do lambdas change it?", "For one-method strategies a lambda or method reference replaces a whole class.")],
    ["Removes conditionals", "More classes", "Clients must know the options", "Easy to test each algorithm"]));

  items.push(P("Behavioral", "observer", "Observer", "When one object changes, notify everyone who depends on it, without coupling them.",
    ["Several parts must react to an event", "The publisher should not know who listens", "Listeners come and go at runtime"],
    ["EventBus|class|listeners|subscribe(type, l); publish(e)", "Listener|interface||onEvent(e)", "EmailListener|class||", "AuditListener|class||", "StockListener|class||"],
    [["EmailListener", "Listener", "implements"], ["AuditListener", "Listener", "implements"], ["StockListener", "Listener", "implements"], ["EventBus", "Listener", "has", "many"]],
    [["Swing listeners, Spring ApplicationEvent", "Beans publish and listen to events."], ["Reactive streams, message brokers", "Observer at a distributed scale."]],
    R`import java.util.*;
import java.util.function.Consumer;

class EventBus {
  private final Map<String, List<Consumer<String>>> listeners = new HashMap<>();
  void subscribe(String type, Consumer<String> l) { listeners.computeIfAbsent(type, k -> new ArrayList<>()).add(l); }
  void publish(String type, String payload) {
    for (Consumer<String> l : listeners.getOrDefault(type, List.of())) {
      try { l.accept(payload); } catch (RuntimeException e) { System.out.println("  listener failed: " + e.getMessage()); }     // one bad listener must not stop the rest
    }
  }
}
public class Main {
  public static void main(String[] a) {
    EventBus bus = new EventBus();
    bus.subscribe("order.placed", o -> System.out.println("  email: thanks for order " + o));
    bus.subscribe("order.placed", o -> System.out.println("  audit: order " + o + " recorded"));
    bus.subscribe("order.placed", o -> { throw new IllegalStateException("stock service down"); });
    bus.subscribe("order.placed", o -> System.out.println("  stock: reserve items for " + o));
    bus.publish("order.placed", "#1001");
  }
}`,
    [F("Observer vs Pub/Sub?", "Observer is in-process: subject calls listeners directly. Pub/sub adds a broker between them, so publishers and subscribers are fully decoupled and can be on different machines."), F("What are the risks?", "Memory leaks if listeners are never removed, unexpected ordering, and one slow or failing listener affecting others. Handle errors per listener and consider async delivery."), F("Sync or async?", "Synchronous is simple and transactional; asynchronous protects the publisher from slow listeners but loses ordering and immediate errors.")],
    ["Loose coupling", "Hidden control flow", "Listener failures need isolation", "Memory leaks if not unsubscribed"]));

  items.push(P("Behavioral", "command", "Command", "Turn a request into an object so you can queue it, log it, retry it or undo it.",
    ["Undo and redo", "Queue or schedule operations", "Record operations to replay or audit"],
    ["Command|interface||execute(); undo()", "AddItem|class|cart; item|", "RemoveItem|class|cart; item|", "Invoker|class|history|run(c); undo()"],
    [["AddItem", "Command", "implements"], ["RemoveItem", "Command", "implements"], ["Invoker", "Command", "has", "history"]],
    [["Runnable, Callable, ExecutorService", "Work packaged as an object to run later."], ["Undo stacks, job queues, database transaction logs", "Commands you can record and replay."]],
    R`import java.util.*;

interface Command { void execute(); void undo(); }
class AddItem implements Command {
  private final List<String> cart; private final String item;
  AddItem(List<String> c, String i) { cart = c; item = i; }
  public void execute() { cart.add(item); } public void undo() { cart.remove(item); }
}
class RemoveItem implements Command {
  private final List<String> cart; private final String item; private int index = -1;
  RemoveItem(List<String> c, String i) { cart = c; item = i; }
  public void execute() { index = cart.indexOf(item); if (index >= 0) cart.remove(index); }
  public void undo() { if (index >= 0) cart.add(index, item); }
}
class Invoker {
  private final Deque<Command> history = new ArrayDeque<>();
  void run(Command c) { c.execute(); history.push(c); }
  void undo() { if (!history.isEmpty()) history.pop().undo(); }
}
public class Main {
  public static void main(String[] a) {
    List<String> cart = new ArrayList<>(); Invoker inv = new Invoker();
    inv.run(new AddItem(cart, "book")); inv.run(new AddItem(cart, "pen")); inv.run(new RemoveItem(cart, "book"));
    System.out.println(cart); inv.undo(); System.out.println(cart); inv.undo(); System.out.println(cart);
  }
}`,
    [F("Command vs Strategy?", "A command is a request (with data and a receiver) you can store and undo; a strategy is an algorithm you plug in. Commands are about what to do and when, strategies about how."), F("How does it relate to event sourcing?", "Commands express intent; the events they produce are stored as the source of truth. Undo becomes a compensating event."), F("How do you support macros?", "A composite command that holds a list of commands and executes or undoes them together.")],
    ["Enables undo, queue, log", "More classes", "Memory for history", "Natural fit for job queues"]));

  items.push(P("Behavioral", "state", "State", "Let an object change its behaviour when its internal state changes.",
    ["An object behaves differently in different phases (order, connection, document)", "You have many if/else on a status field", "Legal transitions must be enforced"],
    ["Order|class|state|pay(); ship(); cancel()", "OrderState|interface||pay(o); ship(o); cancel(o)", "Created|class||", "Paid|class||", "Shipped|class||", "Cancelled|class||"],
    [["Created", "OrderState", "implements"], ["Paid", "OrderState", "implements"], ["Shipped", "OrderState", "implements"], ["Cancelled", "OrderState", "implements"], ["Order", "OrderState", "has"]],
    [["Vending machines, TCP connections, workflow engines", "Behaviour depends on the phase."], ["Spring State Machine", "A framework for the same idea."]],
    R`interface OrderState { OrderState pay(); OrderState ship(); OrderState cancel(); String name(); }
class Created implements OrderState {
  public OrderState pay() { return new Paid(); } public OrderState ship() { throw new IllegalStateException("pay first"); } public OrderState cancel() { return new Cancelled(); } public String name() { return "CREATED"; }
}
class Paid implements OrderState {
  public OrderState pay() { throw new IllegalStateException("already paid"); } public OrderState ship() { return new Shipped(); } public OrderState cancel() { System.out.println("  refunding"); return new Cancelled(); } public String name() { return "PAID"; }
}
class Shipped implements OrderState {
  public OrderState pay() { throw new IllegalStateException("already paid"); } public OrderState ship() { throw new IllegalStateException("already shipped"); } public OrderState cancel() { throw new IllegalStateException("too late to cancel"); } public String name() { return "SHIPPED"; }
}
class Cancelled implements OrderState {
  public OrderState pay() { throw new IllegalStateException("cancelled"); } public OrderState ship() { throw new IllegalStateException("cancelled"); } public OrderState cancel() { return this; } public String name() { return "CANCELLED"; }
}
class Order {
  private OrderState state = new Created();
  void pay() { state = state.pay(); } void ship() { state = state.ship(); } void cancel() { state = state.cancel(); } String status() { return state.name(); }
}
public class Main {
  public static void main(String[] a) {
    Order o = new Order(); System.out.println(o.status()); o.pay(); o.ship(); System.out.println(o.status());
    try { o.cancel(); } catch (IllegalStateException e) { System.out.println("cannot cancel: " + e.getMessage()); }
  }
}`,
    [F("State pattern vs an enum with a switch?", "An enum with a transition table is fine for simple machines. Use the pattern when each state has real behaviour of its own."), F("Where do transitions live?", "Either inside states (as here) or in a central table; a table is easier to visualise and validate."), F("How would you persist it?", "Store the state name; rebuild the state object on load. Record transitions as events for audit.")],
    ["Removes status if/else", "Many small classes", "Transitions are explicit", "Good for audit of life cycle"]));

  items.push(P("Behavioral", "template", "Template Method", "Define the skeleton of an algorithm in a base class and let subclasses fill in the steps.",
    ["Several processes share the same order of steps", "Only some steps differ", "You want to enforce the flow"],
    ["DataImporter|abstract||run(); read(); validate(); save()", "CsvImporter|class||", "JsonImporter|class||"],
    [["CsvImporter", "DataImporter", "extends"], ["JsonImporter", "DataImporter", "extends"]],
    [["JdbcTemplate, HttpServlet.service()", "The framework owns the flow; you fill in the steps."], ["AbstractList, InputStream", "Base classes implement most, subclasses supply the rest."]],
    R`import java.util.*;

abstract class DataImporter {
  final void run(String source) {                          // the template: final so the order cannot be changed
    List<String> rows = read(source); int ok = 0;
    for (String r : rows) if (validate(r)) { save(r); ok++; }
    System.out.println(getClass().getSimpleName() + ": " + ok + " of " + rows.size() + " rows imported");
  }
  protected abstract List<String> read(String source);
  protected boolean validate(String row) { return !row.isBlank(); }     // a hook with a default
  protected abstract void save(String row);
}
class CsvImporter extends DataImporter {
  protected List<String> read(String s) { return Arrays.asList(s.split(",")); }
  protected void save(String r) { System.out.println("  csv row: " + r); }
}
class JsonImporter extends DataImporter {
  protected List<String> read(String s) { return List.of(s.replace("[", "").replace("]", "").split(";")); }
  protected boolean validate(String r) { return r.contains(":"); }
  protected void save(String r) { System.out.println("  json entry: " + r); }
}
public class Main { public static void main(String[] a) { new CsvImporter().run("a,b, ,c"); new JsonImporter().run("[id:1;bad;id:2]"); } }`,
    [F("Template Method vs Strategy?", "Template Method uses inheritance and fixes the skeleton; Strategy uses composition and swaps a whole algorithm. Composition is usually more flexible."), F("Why make the template final?", "So subclasses cannot change the order of steps, only the steps themselves."), F("What is the Hollywood principle?", "Do not call us, we will call you: the base class calls your code, not the other way round.")],
    ["Reuses the flow", "Inheritance coupling", "Easy to enforce order", "Prefer Strategy when you can"]));

  items.push(P("Behavioral", "chain", "Chain of Responsibility", "Pass a request along a chain of handlers until one handles it.",
    ["Several checks or handlers in sequence (auth, validation, logging)", "The set of handlers changes", "The sender should not know who handles it"],
    ["Handler|abstract|next|handle(request)", "AuthHandler|class||", "RateLimitHandler|class||", "ValidationHandler|class||", "Request|class|user; body; count|"],
    [["AuthHandler", "Handler", "extends"], ["RateLimitHandler", "Handler", "extends"], ["ValidationHandler", "Handler", "extends"], ["Handler", "Handler", "has", "next"], ["Handler", "Request", "uses"]],
    [["Servlet filters, Spring Security filter chain", "Each filter can stop or pass on the request."], ["Logging levels, exception handlers", "Handle here or pass up."]],
    R`class Request { final String user, body; final int count; Request(String u, String b, int c) { user = u; body = b; count = c; } }
abstract class Handler {
  private Handler next;
  Handler then(Handler n) { next = n; return n; }
  String handle(Request r) { String problem = check(r); if (problem != null) return problem; return next == null ? "OK" : next.handle(r); }
  protected abstract String check(Request r);                    // return a problem to stop the chain, or null to continue
}
class AuthHandler extends Handler { protected String check(Request r) { return r.user == null ? "401 not authenticated" : null; } }
class RateLimitHandler extends Handler { protected String check(Request r) { return r.count > 100 ? "429 too many requests" : null; } }
class ValidationHandler extends Handler { protected String check(Request r) { return r.body == null || r.body.isBlank() ? "400 empty body" : null; } }
public class Main {
  public static void main(String[] a) {
    Handler chain = new AuthHandler(); chain.then(new RateLimitHandler()).then(new ValidationHandler());
    System.out.println(chain.handle(new Request("asha", "{}", 5)));
    System.out.println(chain.handle(new Request(null, "{}", 5)));
    System.out.println(chain.handle(new Request("ravi", "{}", 500)));
    System.out.println(chain.handle(new Request("meena", " ", 1)));
  }
}`,
    [F("Where does order matter?", "Cheap and security checks first (authentication before authorisation before validation) so you fail fast and never process unauthenticated data."), F("Chain vs Decorator?", "Both wrap a next element. In a chain, any handler may stop the request; a decorator always passes through and adds behaviour."), F("What if nobody handles it?", "Decide a default (reject or accept) explicitly; silent fall-through is a bug source.")],
    ["Flexible pipeline", "No guarantee it is handled", "Debugging the path", "Powers security and web filters"]));

  return items;
});
