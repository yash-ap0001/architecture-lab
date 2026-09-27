/* Low-level design questions, part B. Same format as lld_a.js. */
(function (root, factory) { const items = factory(); if (typeof module === "object" && module.exports) module.exports = items; else (root.LabLLDParts = root.LabLLDParts || []).push(...items); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const R = String.raw;
  const L = (id, title, ask, func, classes, rels, patterns, code, follow, look) => ({ id, title, ask, func, classes, rels, patterns, code, follow, look });
  const F = (q, a) => ({ q, a });
  const items = [];

  items.push(L("splitwise", "Expense sharing (Splitwise)", "Design an app where friends share expenses and settle up.",
    ["Add an expense paid by one person and split among several", "Equal, exact and percentage splits", "Show who owes whom", "Simplify balances"],
    ["User|class|id; name|", "Expense|class|payer; amount; splits|", "Split|class|user; amount|", "SplitStrategy|interface||split(amount, users, values)", "EqualSplit|class||", "PercentSplit|class||", "ExactSplit|class||", "BalanceSheet|class|owes|add(expense); show(); simplify()"],
    [["EqualSplit", "SplitStrategy", "implements"], ["PercentSplit", "SplitStrategy", "implements"], ["ExactSplit", "SplitStrategy", "implements"], ["Expense", "Split", "has", "many"], ["Expense", "User", "uses", "payer"], ["BalanceSheet", "Expense", "uses"]],
    [["Strategy", "Each split type is a strategy, so a new type is a new class."]],
    R`import java.util.*;

interface SplitStrategy { Map<String, Double> split(double amount, List<String> users, double[] values); }
class EqualSplit implements SplitStrategy {
  public Map<String, Double> split(double amount, List<String> users, double[] v) { Map<String, Double> m = new LinkedHashMap<>(); for (String u : users) m.put(u, amount / users.size()); return m; }
}
class PercentSplit implements SplitStrategy {
  public Map<String, Double> split(double amount, List<String> users, double[] pct) {
    double sum = 0; for (double p : pct) sum += p; if (Math.abs(sum - 100) > 1e-6) throw new IllegalArgumentException("percentages must total 100");
    Map<String, Double> m = new LinkedHashMap<>(); for (int i = 0; i < users.size(); i++) m.put(users.get(i), amount * pct[i] / 100); return m;
  }
}
class ExactSplit implements SplitStrategy {
  public Map<String, Double> split(double amount, List<String> users, double[] v) {
    double sum = 0; for (double x : v) sum += x; if (Math.abs(sum - amount) > 1e-6) throw new IllegalArgumentException("amounts must add up");
    Map<String, Double> m = new LinkedHashMap<>(); for (int i = 0; i < users.size(); i++) m.put(users.get(i), v[i]); return m;
  }
}
class BalanceSheet {
  private final Map<String, Double> net = new TreeMap<>();                         // positive: is owed money, negative: owes money
  void add(String payer, double amount, Map<String, Double> shares) {
    net.merge(payer, amount, Double::sum);
    shares.forEach((u, share) -> net.merge(u, -share, Double::sum));
  }
  List<String> simplify() {                                                       // minimum-ish transfers: match biggest debtor with biggest creditor
    List<String> out = new ArrayList<>(); Map<String, Double> n = new TreeMap<>(net);
    while (true) {
      String debtor = null, creditor = null;
      for (Map.Entry<String, Double> e : n.entrySet()) {
        if (e.getValue() < -0.005 && (debtor == null || e.getValue() < n.get(debtor))) debtor = e.getKey();
        if (e.getValue() > 0.005 && (creditor == null || e.getValue() > n.get(creditor))) creditor = e.getKey();
      }
      if (debtor == null || creditor == null) break;
      double amt = Math.min(-n.get(debtor), n.get(creditor)); n.merge(debtor, amt, Double::sum); n.merge(creditor, -amt, Double::sum);
      out.add(debtor + " pays " + creditor + " " + String.format("%.2f", amt));
    }
    return out;
  }
}
public class Main {
  public static void main(String[] a) {
    BalanceSheet sheet = new BalanceSheet(); List<String> all = List.of("asha", "ravi", "meena");
    sheet.add("asha", 300, new EqualSplit().split(300, all, null));
    sheet.add("ravi", 90, new PercentSplit().split(90, all, new double[] { 50, 25, 25 }));
    sheet.simplify().forEach(System.out::println);
  }
}`,
    [F("How do you deal with rounding?", "Use integer cents (long) or BigDecimal, and give the remainder cents to one participant so the total always matches."), F("Why simplify debts?", "It reduces the number of payments. Computing the true minimum is NP-hard in general; the greedy match of largest debtor to largest creditor is good in practice."), F("How would groups and currencies work?", "A Group owns a BalanceSheet; convert to a base currency at the expense date and store the rate.")],
    ["Strategy for split types", "Validation (totals match)", "Net balance per user", "Simplification", "Money handled safely"]));

  items.push(L("bookmyshow", "Movie ticket booking (BookMyShow)", "Design seat booking for movie shows with concurrency in mind.",
    ["Browse shows and seats", "Hold seats for a few minutes, then pay", "Nobody can book the same seat twice", "Release unpaid holds"],
    ["Show|class|id; movie; seats|", "Seat|class|id; status; heldBy; heldUntil|", "SeatStatus|enum|FREE; HELD; BOOKED|", "Booking|class|id; user; seats|", "BookingService|class|shows; bookings|hold(show, seats, user, now); confirm(show, user, now)"],
    [["Show", "Seat", "has", "many"], ["Seat", "SeatStatus", "uses"], ["BookingService", "Show", "uses"], ["BookingService", "Booking", "has", "many"]],
    [["Locking with expiry", "A hold is a lock with a time limit so abandoned carts free the seats."], ["Atomic hold", "Either all requested seats are held or none."]],
    R`import java.util.*;

enum SeatStatus { FREE, HELD, BOOKED }
class Seat { final String id; SeatStatus status = SeatStatus.FREE; String heldBy; long heldUntil; Seat(String id) { this.id = id; } }
class Show {
  final String id; final Map<String, Seat> seats = new LinkedHashMap<>();
  Show(String id, String... seatIds) { this.id = id; for (String s : seatIds) seats.put(s, new Seat(s)); }
}
class BookingService {
  static final long HOLD_MS = 5 * 60 * 1000;
  private final Object lock = new Object();
  private void expire(Show show, long now) { for (Seat s : show.seats.values()) if (s.status == SeatStatus.HELD && s.heldUntil <= now) { s.status = SeatStatus.FREE; s.heldBy = null; } }
  boolean hold(Show show, List<String> ids, String user, long now) {
    synchronized (lock) {                                                         // all-or-nothing under one lock (per show in a real system)
      expire(show, now);
      for (String id : ids) { Seat s = show.seats.get(id); if (s == null || s.status != SeatStatus.FREE) return false; }
      for (String id : ids) { Seat s = show.seats.get(id); s.status = SeatStatus.HELD; s.heldBy = user; s.heldUntil = now + HOLD_MS; }
      return true;
    }
  }
  int confirm(Show show, String user, long now) {
    synchronized (lock) {
      expire(show, now); int n = 0;
      for (Seat s : show.seats.values()) if (s.status == SeatStatus.HELD && user.equals(s.heldBy)) { s.status = SeatStatus.BOOKED; n++; }
      return n;
    }
  }
}
public class Main {
  public static void main(String[] a) {
    Show show = new Show("s1", "A1", "A2", "A3"); BookingService svc = new BookingService();
    System.out.println("asha holds A1,A2: " + svc.hold(show, List.of("A1", "A2"), "asha", 0));
    System.out.println("ravi wants A2: " + svc.hold(show, List.of("A2", "A3"), "ravi", 1000));
    System.out.println("ravi after asha's hold expired: " + svc.hold(show, List.of("A2", "A3"), "ravi", BookingService.HOLD_MS + 1));
    System.out.println("ravi confirms " + svc.confirm(show, "ravi", BookingService.HOLD_MS + 2) + " seats");
  }
}`,
    [F("How does this scale to millions of users?", "Lock per show (or per seat) in a database with SELECT FOR UPDATE, or a Redis lock with TTL. Hold seats first, take payment second, confirm third."), F("What if payment succeeds after the hold expired?", "Re-check the hold at confirmation; if it is gone and the seat is free, take it, otherwise refund automatically."), F("How do you release holds without a timer per seat?", "Lazy expiry (check heldUntil when reading), plus a background sweeper for cleanup.")],
    ["All-or-nothing seat hold", "Expiry of holds", "Concurrency control", "Separate hold and confirm", "Clean state model"]));

  items.push(L("hotel", "Hotel booking", "Design a hotel reservation system.",
    ["Search rooms available for a date range", "Book and cancel a reservation", "Room types with prices", "No overlapping bookings for a room"],
    ["Hotel|class|rooms; reservations|search(from, to, type); book(...); cancel(id)", "Room|class|number; type; price|", "RoomType|enum|SINGLE; DOUBLE; SUITE|", "Reservation|class|id; room; guest; from; to|overlaps(from, to)", "Guest|class|name|"],
    [["Hotel", "Room", "has", "many"], ["Hotel", "Reservation", "has", "many"], ["Room", "RoomType", "uses"], ["Reservation", "Room", "uses"], ["Reservation", "Guest", "uses"]],
    [["Interval overlap", "Two stays overlap when a.from < b.to and b.from < a.to."], ["Factory (optional)", "Create rooms per type with default prices."]],
    R`import java.util.*;

enum RoomType { SINGLE, DOUBLE, SUITE }
class Room { final int number; final RoomType type; final double price; Room(int n, RoomType t, double p) { number = n; type = t; price = p; } }
class Reservation {
  final String id, guest; final Room room; final int from, to; boolean active = true;              // dates as day numbers; check-out day is free
  Reservation(String id, String guest, Room room, int from, int to) { this.id = id; this.guest = guest; this.room = room; this.from = from; this.to = to; }
  boolean overlaps(int f, int t) { return active && from < t && f < to; }
}
class Hotel {
  private final List<Room> rooms = new ArrayList<>(); private final Map<String, Reservation> all = new HashMap<>(); private int seq = 0;
  void add(Room r) { rooms.add(r); }
  private boolean free(Room r, int f, int t) { for (Reservation x : all.values()) if (x.room == r && x.overlaps(f, t)) return false; return true; }
  List<Room> search(int f, int t, RoomType type) { List<Room> out = new ArrayList<>(); for (Room r : rooms) if (r.type == type && free(r, f, t)) out.add(r); return out; }
  synchronized Reservation book(String guest, RoomType type, int f, int t) {
    if (f >= t) throw new IllegalArgumentException("check-out must be after check-in");
    for (Room r : rooms) if (r.type == type && free(r, f, t)) { Reservation res = new Reservation("R" + (++seq), guest, r, f, t); all.put(res.id, res); return res; }
    return null;
  }
  void cancel(String id) { all.get(id).active = false; }
  double cost(Reservation r) { return (r.to - r.from) * r.room.price; }
}
public class Main {
  public static void main(String[] a) {
    Hotel h = new Hotel(); h.add(new Room(101, RoomType.DOUBLE, 100)); h.add(new Room(102, RoomType.DOUBLE, 120));
    Reservation r1 = h.book("asha", RoomType.DOUBLE, 1, 4), r2 = h.book("ravi", RoomType.DOUBLE, 3, 5), r3 = h.book("meena", RoomType.DOUBLE, 3, 5);
    System.out.println(r1.room.number + " " + r2.room.number + " " + (r3 == null ? "full" : "booked") + ", cost " + h.cost(r1));
    h.cancel(r1.id); System.out.println("after cancel: " + h.search(1, 3, RoomType.DOUBLE).size() + " rooms free");
  }
}`,
    [F("How do you prevent double booking under concurrency?", "A unique constraint on (room, date) in the database, or lock the room row during the booking transaction."), F("How do you search fast for many hotels?", "Keep an availability table per room and date, indexed, or an interval tree per room; use a search index for filters."), F("Overbooking?", "Some hotels overbook on purpose; model it as capacity per room type rather than fixed rooms.")],
    ["Interval overlap logic", "Cancellation frees the room", "Concurrency", "Room types and prices", "Input validation"]));

  items.push(L("notification", "Notification service", "Design a service that sends notifications on several channels according to user preferences.",
    ["Send by email, SMS or push", "User chooses channels per event type", "Add a new channel easily", "Record what was sent"],
    ["NotificationService|class|channels; prefs; observers|send(user, event, message)", "Channel|interface||send(user, message)", "EmailChannel|class||", "SmsChannel|class||", "PushChannel|class||", "ChannelFactory|class||create(name)", "Preferences|class|byUser|channelsFor(user, event)"],
    [["EmailChannel", "Channel", "implements"], ["SmsChannel", "Channel", "implements"], ["PushChannel", "Channel", "implements"], ["ChannelFactory", "Channel", "uses"], ["NotificationService", "Channel", "has", "many"], ["NotificationService", "Preferences", "uses"]],
    [["Strategy", "Each channel is a strategy for delivering."], ["Factory", "Create a channel by name."], ["Observer (optional)", "Other services subscribe to events and trigger notifications."]],
    R`import java.util.*;

interface Channel { boolean send(String user, String message); String name(); }
class EmailChannel implements Channel { public boolean send(String u, String m) { System.out.println("  email to " + u + ": " + m); return true; } public String name() { return "email"; } }
class SmsChannel implements Channel { public boolean send(String u, String m) { System.out.println("  sms to " + u + ": " + m); return true; } public String name() { return "sms"; } }
class PushChannel implements Channel { int failures = 1; public boolean send(String u, String m) { if (failures-- > 0) return false; System.out.println("  push to " + u + ": " + m); return true; } public String name() { return "push"; } }
class ChannelFactory {
  static Channel create(String n) { switch (n) { case "email": return new EmailChannel(); case "sms": return new SmsChannel(); case "push": return new PushChannel(); default: throw new IllegalArgumentException(n); } }
}
class Preferences {
  private final Map<String, Map<String, Set<String>>> byUser = new HashMap<>();
  void set(String user, String event, String... channels) { byUser.computeIfAbsent(user, k -> new HashMap<>()).put(event, new LinkedHashSet<>(Arrays.asList(channels))); }
  Set<String> channelsFor(String user, String event) { return byUser.getOrDefault(user, Map.of()).getOrDefault(event, Set.of("email")); }
}
class NotificationService {
  private final Map<String, Channel> channels = new HashMap<>(); private final Preferences prefs; final List<String> log = new ArrayList<>();
  NotificationService(Preferences p) { prefs = p; }
  void register(Channel c) { channels.put(c.name(), c); }
  void send(String user, String event, String message) {
    for (String name : prefs.channelsFor(user, event)) {
      Channel c = channels.get(name); boolean ok = false;
      for (int attempt = 0; attempt < 3 && !ok; attempt++) ok = c.send(user, message);       // simple retry; use backoff and a queue in real life
      log.add(user + ":" + name + ":" + (ok ? "sent" : "failed"));
    }
  }
}
public class Main {
  public static void main(String[] a) {
    Preferences p = new Preferences(); p.set("asha", "otp", "sms", "push"); NotificationService s = new NotificationService(p);
    for (String c : List.of("email", "sms", "push")) s.register(ChannelFactory.create(c));
    s.send("asha", "otp", "Your code is 4821"); s.send("ravi", "promo", "Big sale");
    System.out.println(s.log);
  }
}`,
    [F("How do you make it reliable at scale?", "Put messages on a queue per channel, deliver with workers, retry with backoff, dead-letter after N tries, and store status. That is the system-design version of this class design."), F("How do you avoid duplicates?", "An idempotency key per (user, event, message) checked before sending."), F("How do you add rate limits and quiet hours?", "A decorator or filter in front of each Channel (Decorator pattern) applying per-user limits and time windows.")],
    ["Channel abstraction (Strategy)", "Factory", "Preferences", "Retry and failure record", "Extensible"]));

  items.push(L("snakeladder", "Snakes and ladders", "Design the board game snakes and ladders.",
    ["Board with snakes and ladders", "Two or more players roll a die in turn", "Land on a snake head go down, a ladder foot go up", "First to reach the last square wins"],
    ["Game|class|board; players; dice|play()", "Board|class|size; jumps|next(pos)", "Player|class|name; position|", "Dice|interface||roll()", "RandomDice|class|rng|roll()"],
    [["RandomDice", "Dice", "implements"], ["Game", "Board", "has"], ["Game", "Player", "has", "many"], ["Game", "Dice", "uses"]],
    [["Strategy", "Dice can be random, fixed (for tests) or loaded."], ["Data-driven board", "Snakes and ladders are just a map from square to square."]],
    R`import java.util.*;

interface Dice { int roll(); }
class RandomDice implements Dice { private final Random r; RandomDice(long seed) { r = new Random(seed); } public int roll() { return r.nextInt(6) + 1; } }
class Board {
  final int size; private final Map<Integer, Integer> jumps = new HashMap<>();
  Board(int size) { this.size = size; }
  void addJump(int from, int to) { if (from == to || from >= size || to < 1) throw new IllegalArgumentException("bad jump"); jumps.put(from, to); }
  int next(int pos) { return jumps.getOrDefault(pos, pos); }
}
class Player { final String name; int pos = 0; Player(String n) { name = n; } }
class Game {
  private final Board board; private final List<Player> players; private final Dice dice;
  Game(Board b, List<Player> p, Dice d) { board = b; players = p; dice = d; }
  Player play() {
    int turn = 0;
    while (true) {
      Player p = players.get(turn % players.size()); int roll = dice.roll(), target = p.pos + roll;
      if (target <= board.size) { p.pos = board.next(target); }                              // must not overshoot the last square
      if (p.pos == board.size) return p;
      turn++;
    }
  }
}
public class Main {
  public static void main(String[] a) {
    Board b = new Board(30); b.addJump(4, 14); b.addJump(9, 31 - 1); b.addJump(17, 7); b.addJump(27, 5);
    Game g = new Game(b, List.of(new Player("asha"), new Player("ravi")), new RandomDice(42));
    System.out.println("winner: " + g.play().name);
  }
}`,
    [F("How do you avoid a snake and ladder chain loop?", "Validate the jump map when building the board: following jumps from any square must end (no cycles), and no jump may start on the final square."), F("How do you test a game with dice?", "Inject a Dice implementation that returns a scripted sequence."), F("Rule variants (need exact roll, extra turn on six)?", "Move rules into a RuleSet strategy that Game consults.")],
    ["Board as data", "Injectable dice for tests", "Validation of jumps", "Turn loop and win rule", "Extensible rules"]));

  items.push(L("texteditor", "Text editor with undo and redo", "Design a text editor core with undo and redo.",
    ["Insert and delete text", "Undo and redo any number of steps", "A new edit clears the redo history", "Extensible with new operations"],
    ["Editor|class|text; undo; redo|insert(pos, s); delete(pos, len); undo(); redo()", "Command|interface||apply(doc); revert(doc)", "InsertCommand|class|pos; text|", "DeleteCommand|class|pos; len; removed|", "Document|class|content|"],
    [["InsertCommand", "Command", "implements"], ["DeleteCommand", "Command", "implements"], ["Editor", "Command", "has", "history"], ["Editor", "Document", "has"]],
    [["Command", "Each edit is an object that can apply and revert itself."], ["Two stacks", "Undo stack and redo stack."], ["Memento (alternative)", "Snapshots of the document; simpler but heavier."]],
    R`import java.util.*;

class Document { StringBuilder content = new StringBuilder(); public String toString() { return content.toString(); } }
interface Command { void apply(Document d); void revert(Document d); }
class InsertCommand implements Command {
  private final int pos; private final String text;
  InsertCommand(int pos, String text) { this.pos = pos; this.text = text; }
  public void apply(Document d) { d.content.insert(pos, text); }
  public void revert(Document d) { d.content.delete(pos, pos + text.length()); }
}
class DeleteCommand implements Command {
  private final int pos, len; private String removed = "";
  DeleteCommand(int pos, int len) { this.pos = pos; this.len = len; }
  public void apply(Document d) { removed = d.content.substring(pos, pos + len); d.content.delete(pos, pos + len); }
  public void revert(Document d) { d.content.insert(pos, removed); }
}
class Editor {
  private final Document doc = new Document(); private final Deque<Command> undo = new ArrayDeque<>(), redo = new ArrayDeque<>();
  void run(Command c) { c.apply(doc); undo.push(c); redo.clear(); }                        // a new edit invalidates the redo history
  void insert(int pos, String s) { run(new InsertCommand(pos, s)); }
  void delete(int pos, int len) { run(new DeleteCommand(pos, len)); }
  void undo() { if (undo.isEmpty()) return; Command c = undo.pop(); c.revert(doc); redo.push(c); }
  void redo() { if (redo.isEmpty()) return; Command c = redo.pop(); c.apply(doc); undo.push(c); }
  String text() { return doc.toString(); }
}
public class Main {
  public static void main(String[] a) {
    Editor e = new Editor(); e.insert(0, "hello"); e.insert(5, " world"); e.delete(0, 6);
    System.out.println(e.text()); e.undo(); System.out.println(e.text()); e.undo(); System.out.println(e.text()); e.redo(); System.out.println(e.text());
    e.insert(0, "X"); e.redo(); System.out.println(e.text());
  }
}`,
    [F("How do you bound memory?", "Cap the history length, or store compact diffs; merge consecutive typed characters into one command."), F("How would you support collaborative editing?", "Operations must be transformed against concurrent ones (Operational Transform) or modelled as CRDT operations; undo becomes 'undo my last operation'."), F("Command or Memento?", "Command stores small deltas and scales to large documents; Memento is simplest but copies the whole state each time.")],
    ["Command pattern", "Two-stack undo/redo", "Redo cleared on new edit", "Delete remembers removed text", "Memory discussion"]));

  items.push(L("cab", "Cab booking (Uber)", "Design the core of a ride-hailing app: drivers, riders, matching and trips.",
    ["Riders request a trip from A to B", "Match the nearest available driver", "Trip states: requested, accepted, started, completed", "Compute fare"],
    ["Rider|class|id; name|", "Driver|class|id; location; available|", "Location|class|x; y|distance(o)", "Trip|class|id; rider; driver; from; to; state|", "TripState|enum|REQUESTED; ACCEPTED; STARTED; COMPLETED; CANCELLED|", "MatchingStrategy|interface||pick(drivers, from)", "NearestMatching|class||", "FareStrategy|interface||fare(distance)", "RideService|class|drivers; trips|request(...); start(id); complete(id)"],
    [["NearestMatching", "MatchingStrategy", "implements"], ["RideService", "Driver", "has", "many"], ["RideService", "Trip", "has", "many"], ["RideService", "MatchingStrategy", "uses"], ["RideService", "FareStrategy", "uses"], ["Trip", "TripState", "uses"], ["Trip", "Driver", "uses"], ["Trip", "Rider", "uses"], ["Driver", "Location", "uses"]],
    [["Strategy", "Matching and pricing policies change often (nearest, rating, surge)."], ["State", "A trip moves through a small state machine with legal transitions."]],
    R`import java.util.*;

class Location { final double x, y; Location(double x, double y) { this.x = x; this.y = y; } double distance(Location o) { return Math.hypot(x - o.x, y - o.y); } }
class Driver { final String id; Location loc; boolean available = true; Driver(String id, Location l) { this.id = id; loc = l; } }
enum TripState { REQUESTED, ACCEPTED, STARTED, COMPLETED, CANCELLED }
class Trip {
  final String id, rider; final Driver driver; final Location from, to; TripState state = TripState.ACCEPTED;
  Trip(String id, String rider, Driver d, Location from, Location to) { this.id = id; this.rider = rider; driver = d; this.from = from; this.to = to; }
}
interface MatchingStrategy { Optional<Driver> pick(Collection<Driver> drivers, Location from); }
class NearestMatching implements MatchingStrategy {
  public Optional<Driver> pick(Collection<Driver> ds, Location from) { return ds.stream().filter(d -> d.available).min(Comparator.comparingDouble(d -> d.loc.distance(from))); }
}
interface FareStrategy { double fare(double distance); }
class RideService {
  private final Map<String, Driver> drivers = new HashMap<>(); private final Map<String, Trip> trips = new HashMap<>();
  private final MatchingStrategy matching; private final FareStrategy pricing; private int seq;
  RideService(MatchingStrategy m, FareStrategy p) { matching = m; pricing = p; }
  void addDriver(Driver d) { drivers.put(d.id, d); }
  synchronized Optional<Trip> request(String rider, Location from, Location to) {
    Optional<Driver> d = matching.pick(drivers.values(), from); if (d.isEmpty()) return Optional.empty();
    d.get().available = false; Trip t = new Trip("T" + (++seq), rider, d.get(), from, to); trips.put(t.id, t); return Optional.of(t);
  }
  void start(String id) { Trip t = trips.get(id); if (t.state != TripState.ACCEPTED) throw new IllegalStateException("cannot start from " + t.state); t.state = TripState.STARTED; }
  double complete(String id) {
    Trip t = trips.get(id); if (t.state != TripState.STARTED) throw new IllegalStateException("cannot complete from " + t.state);
    t.state = TripState.COMPLETED; t.driver.available = true; t.driver.loc = t.to; return pricing.fare(t.from.distance(t.to));
  }
}
public class Main {
  public static void main(String[] a) {
    RideService s = new RideService(new NearestMatching(), d -> 50 + 12 * d);
    s.addDriver(new Driver("d1", new Location(0, 0))); s.addDriver(new Driver("d2", new Location(5, 5)));
    Trip t = s.request("asha", new Location(4, 4), new Location(10, 4)).get();
    System.out.println("matched " + t.driver.id); s.start(t.id); System.out.println("fare " + s.complete(t.id));
    System.out.println("second rider matched: " + s.request("ravi", new Location(1, 1), new Location(2, 2)).map(x -> x.driver.id).orElse("nobody"));
  }
}`,
    [F("How do you find nearby drivers among millions?", "A geo index (geohash or quadtree) so you only look at drivers in nearby cells, updated as drivers move."), F("What if the driver declines?", "The trip returns to REQUESTED and the service offers it to the next candidate with a timeout."), F("How do you add surge pricing?", "A FareStrategy that multiplies by a demand factor computed per area.")],
    ["Strategies for matching and fare", "Trip state machine with guards", "Driver availability", "Concurrency on matching", "Geo-index discussion"]));

  items.push(L("filesystem", "In-memory file system", "Design an in-memory file system with directories and files.",
    ["Create directories and files by path", "List a directory", "Read and write file content", "Compute the size of a directory"],
    ["Node|abstract|name|size()", "File|class|content|size()", "Directory|class|children|size(); add(node)", "FileSystem|class|root|mkdir(path); write(path, text); ls(path); read(path)"],
    [["File", "Node", "extends"], ["Directory", "Node", "extends"], ["Directory", "Node", "has", "children"], ["FileSystem", "Directory", "has", "root"]],
    [["Composite", "Files and directories share one interface, so a directory's size is just the sum of its children."]],
    R`import java.util.*;

abstract class Node { final String name; Node(String n) { name = n; } abstract int size(); }
class File extends Node { String content = ""; File(String n) { super(n); } int size() { return content.length(); } }
class Directory extends Node {
  final Map<String, Node> children = new TreeMap<>();
  Directory(String n) { super(n); }
  int size() { int s = 0; for (Node c : children.values()) s += c.size(); return s; }
}
class FileSystem {
  private final Directory root = new Directory("");
  private Directory dir(String path, boolean create) {
    Directory cur = root;
    for (String part : path.split("/")) {
      if (part.isEmpty()) continue;
      Node n = cur.children.get(part);
      if (n == null && create) { n = new Directory(part); cur.children.put(part, n); }
      if (!(n instanceof Directory)) throw new IllegalArgumentException("no such directory: " + path);
      cur = (Directory) n;
    }
    return cur;
  }
  void mkdir(String path) { dir(path, true); }
  void write(String path, String text) {
    int i = path.lastIndexOf('/'); Directory d = dir(path.substring(0, i), true); String name = path.substring(i + 1);
    Node n = d.children.computeIfAbsent(name, File::new); if (!(n instanceof File)) throw new IllegalArgumentException("is a directory"); ((File) n).content += text;
  }
  String read(String path) { int i = path.lastIndexOf('/'); return ((File) dir(path.substring(0, i), false).children.get(path.substring(i + 1))).content; }
  List<String> ls(String path) { return new ArrayList<>(dir(path, false).children.keySet()); }
  int size(String path) { return dir(path, false).size(); }
}
public class Main {
  public static void main(String[] a) {
    FileSystem fs = new FileSystem(); fs.mkdir("/home/asha"); fs.write("/home/asha/notes.txt", "hello"); fs.write("/home/asha/notes.txt", " world"); fs.write("/home/todo.txt", "buy milk");
    System.out.println(fs.ls("/home") + " " + fs.read("/home/asha/notes.txt") + " size " + fs.size("/home"));
  }
}`,
    [F("How would you add permissions and timestamps?", "Add metadata to Node (owner, mode, modified) and check permissions in FileSystem before operations."), F("How do you support symbolic links or move?", "Add a Link node type resolved during path traversal (with cycle detection), and move by re-parenting the node."), F("How do you make size() fast for huge trees?", "Cache sizes in each directory and update ancestors on write, or compute lazily and invalidate.")],
    ["Composite pattern", "Path parsing", "Error handling", "Directory size", "Extensible metadata"]));

  items.push(L("pubsub", "Pub-sub message broker", "Design an in-memory publish-subscribe system.",
    ["Create topics", "Subscribers subscribe to topics", "Publishing delivers to every subscriber of that topic", "Slow subscribers must not block others"],
    ["Broker|class|topics|createTopic(t); subscribe(t, s); publish(t, msg)", "Topic|class|name; subscribers|", "Subscriber|interface||onMessage(topic, msg)", "PrintSubscriber|class|name|", "Message|class|id; payload|"],
    [["PrintSubscriber", "Subscriber", "implements"], ["Broker", "Topic", "has", "many"], ["Topic", "Subscriber", "has", "many"], ["Broker", "Message", "uses"]],
    [["Observer", "Subscribers are notified when a message is published to their topic."], ["Executor per subscriber", "Each subscriber gets its own queue and worker so a slow one does not block others."]],
    R`import java.util.*;
import java.util.concurrent.*;

interface Subscriber { void onMessage(String topic, String msg); }
class Broker {
  private final Map<String, List<Worker>> topics = new ConcurrentHashMap<>();
  private static class Worker {                                                       // one queue and one thread per subscriber
    final BlockingQueue<String> queue = new LinkedBlockingQueue<>(); final Thread thread;
    Worker(String topic, Subscriber s) {
      thread = new Thread(() -> { try { while (true) { String m = queue.take(); if (m.equals("\u0000stop")) return; s.onMessage(topic, m); } } catch (InterruptedException e) { Thread.currentThread().interrupt(); } });
      thread.start();
    }
  }
  void createTopic(String t) { topics.putIfAbsent(t, new CopyOnWriteArrayList<>()); }
  void subscribe(String t, Subscriber s) { topics.get(t).add(new Worker(t, s)); }
  void publish(String t, String msg) { for (Worker w : topics.get(t)) w.queue.add(msg); }
  void shutdown() throws InterruptedException { for (List<Worker> ws : topics.values()) for (Worker w : ws) { w.queue.add("\u0000stop"); w.thread.join(); } }
}
public class Main {
  public static void main(String[] args) throws Exception {
    Broker b = new Broker(); b.createTopic("orders");
    List<String> seen = Collections.synchronizedList(new ArrayList<>());
    b.subscribe("orders", (t, m) -> seen.add("A got " + m));
    b.subscribe("orders", (t, m) -> { try { Thread.sleep(50); } catch (InterruptedException e) { } seen.add("B got " + m); });
    b.publish("orders", "o1"); b.publish("orders", "o2"); b.shutdown();
    Collections.sort(seen); System.out.println(seen);
  }
}`,
    [F("How do you guarantee delivery?", "Persist messages and track an offset per subscriber (as Kafka does); a subscriber acknowledges after processing and resumes from its last offset."), F("What about ordering?", "Ordering within a topic partition per subscriber is natural with one queue; global ordering needs a single partition."), F("How do you handle a failing subscriber?", "Retry with backoff, then move the message to a dead-letter queue; do not block the others.")],
    ["Observer with isolation between subscribers", "Thread safety", "Clean shutdown", "Delivery guarantees discussed", "Topic management"]));

  items.push(L("cart", "Shopping cart with discounts", "Design a shopping cart that applies several kinds of discounts.",
    ["Add and remove items", "Coupons (percent off, flat off), buy-X-get-Y", "Rules can combine in a defined order", "Calculate the total"],
    ["Cart|class|lines; rules|add(item, qty); total()", "Item|class|sku; name; price|", "Line|class|item; qty|", "DiscountRule|interface||apply(cart, subtotal)", "PercentOff|class|pct|", "FlatOff|class|amount; minTotal|", "BuyXGetY|class|sku; x; y|"],
    [["PercentOff", "DiscountRule", "implements"], ["FlatOff", "DiscountRule", "implements"], ["BuyXGetY", "DiscountRule", "implements"], ["Cart", "Line", "has", "many"], ["Line", "Item", "uses"], ["Cart", "DiscountRule", "has", "many"]],
    [["Strategy or Decorator", "Each rule takes the running total and returns a new one, so rules can be stacked in order."]],
    R`import java.util.*;

class Item { final String sku, name; final double price; Item(String s, String n, double p) { sku = s; name = n; price = p; } }
class Line { final Item item; int qty; Line(Item i, int q) { item = i; qty = q; } }
interface DiscountRule { double apply(Cart cart, double running); }
class PercentOff implements DiscountRule { private final double pct; PercentOff(double p) { pct = p; } public double apply(Cart c, double r) { return r * (1 - pct / 100); } }
class FlatOff implements DiscountRule {
  private final double amount, minTotal; FlatOff(double a, double m) { amount = a; minTotal = m; }
  public double apply(Cart c, double r) { return r >= minTotal ? Math.max(0, r - amount) : r; }
}
class BuyXGetY implements DiscountRule {                                              // buy x, get y of them free
  private final String sku; private final int x, y; BuyXGetY(String s, int x, int y) { sku = s; this.x = x; this.y = y; }
  public double apply(Cart c, double r) {
    for (Line l : c.lines()) if (l.item.sku.equals(sku)) { int free = (l.qty / (x + y)) * y; r -= free * l.item.price; }
    return r;
  }
}
class Cart {
  private final Map<String, Line> lines = new LinkedHashMap<>(); private final List<DiscountRule> rules = new ArrayList<>();
  Collection<Line> lines() { return lines.values(); }
  void add(Item i, int qty) { lines.merge(i.sku, new Line(i, qty), (a, b) -> { a.qty += b.qty; return a; }); }
  void remove(String sku) { lines.remove(sku); }
  void addRule(DiscountRule r) { rules.add(r); }
  double subtotal() { double s = 0; for (Line l : lines.values()) s += l.item.price * l.qty; return s; }
  double total() { double t = subtotal(); for (DiscountRule r : rules) t = r.apply(this, t); return Math.round(t * 100) / 100.0; }
}
public class Main {
  public static void main(String[] a) {
    Cart c = new Cart(); Item tee = new Item("T1", "T-shirt", 500), cap = new Item("C1", "Cap", 300);
    c.add(tee, 3); c.add(cap, 1); System.out.println("subtotal " + c.subtotal());
    c.addRule(new BuyXGetY("T1", 2, 1)); c.addRule(new PercentOff(10)); c.addRule(new FlatOff(50, 1000));
    System.out.println("total " + c.total());
  }
}`,
    [F("Does the order of discounts matter?", "Yes: percent then flat gives a different result from flat then percent. Make the order explicit (priority) and document it; some rules must run on the original price."), F("How do you prevent stacking two coupons?", "Give rules a group or exclusivity flag and let the cart pick the best in each group."), F("Money type?", "Use integer cents or BigDecimal; doubles cause rounding errors in real systems.")],
    ["Rules as strategies", "Defined order of application", "Cart operations", "Edge cases (empty cart, min total)", "Money handling"]));

  return items;
});
