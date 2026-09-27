/* Low-level design (class design) questions, part A. Each has requirements, a class diagram, patterns, working Java and follow-ups.
 * Class line: "Name|kind|field; field|method; method"   kind: class, abstract, interface, enum
 * Relation: [from, to, kind, label]   kind: extends, implements, has (composition), uses (association) */
(function (root, factory) { const items = factory(); if (typeof module === "object" && module.exports) module.exports = items; else (root.LabLLDParts = root.LabLLDParts || []).push(...items); })(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const R = String.raw;
  const L = (id, title, ask, func, classes, rels, patterns, code, follow, look) => ({ id, title, ask, func, classes, rels, patterns, code, follow, look });
  const F = (q, a) => ({ q, a });
  const items = [];

  items.push(L("parking", "Parking lot", "Design a parking lot with different vehicle sizes, tickets and fees.",
    ["Park a vehicle in a spot that fits", "Issue a ticket on entry, take payment on exit", "Bikes, cars and trucks; different rates", "Report when the lot is full"],
    ["Vehicle|abstract|plate; type|getType()", "Bike|class||", "Car|class||", "Truck|class||", "VehicleType|enum|BIKE; CAR; TRUCK|", "Spot|class|id; size; parked|fits(v); park(v); free()", "Ticket|class|id; vehicle; spot; entryTime|", "PricingStrategy|interface||price(minutes, type)", "HourlyPricing|class|rates|price(minutes, type)", "ParkingLot|class|spots; active; pricing|park(v, now); exit(plate, now)"],
    [["Bike", "Vehicle", "extends"], ["Car", "Vehicle", "extends"], ["Truck", "Vehicle", "extends"], ["HourlyPricing", "PricingStrategy", "implements"], ["ParkingLot", "Spot", "has", "many"], ["ParkingLot", "Ticket", "has", "active"], ["ParkingLot", "PricingStrategy", "uses"], ["Ticket", "Spot", "uses"], ["Ticket", "Vehicle", "uses"]],
    [["Strategy", "Pricing changes (hourly, flat, peak) without touching ParkingLot."], ["Factory (optional)", "Create the right Vehicle subtype from an input type."], ["Enum", "VehicleType and spot size share an ordering so a bigger spot fits a smaller vehicle."]],
    R`import java.util.*;

enum VehicleType { BIKE, CAR, TRUCK }
abstract class Vehicle { final String plate; final VehicleType type; Vehicle(String p, VehicleType t) { plate = p; type = t; } }
class Bike extends Vehicle { Bike(String p) { super(p, VehicleType.BIKE); } }
class Car extends Vehicle { Car(String p) { super(p, VehicleType.CAR); } }
class Truck extends Vehicle { Truck(String p) { super(p, VehicleType.TRUCK); } }

class Spot {
  final int id; final VehicleType size; Vehicle parked;
  Spot(int id, VehicleType size) { this.id = id; this.size = size; }
  boolean fits(Vehicle v) { return parked == null && v.type.ordinal() <= size.ordinal(); }
}
class Ticket {
  final String id; final Vehicle vehicle; final Spot spot; final long entry;
  Ticket(String id, Vehicle v, Spot s, long entry) { this.id = id; vehicle = v; spot = s; this.entry = entry; }
}
interface PricingStrategy { double price(long minutes, VehicleType type); }
class HourlyPricing implements PricingStrategy {
  private final Map<VehicleType, Double> perHour = Map.of(VehicleType.BIKE, 10.0, VehicleType.CAR, 20.0, VehicleType.TRUCK, 40.0);
  public double price(long minutes, VehicleType t) { long hours = Math.max(1, (minutes + 59) / 60); return hours * perHour.get(t); }
}
class ParkingLot {
  private final List<Spot> spots = new ArrayList<>();
  private final Map<String, Ticket> active = new HashMap<>();
  private final PricingStrategy pricing; private int seq = 0;
  ParkingLot(List<Spot> spots, PricingStrategy p) { this.spots.addAll(spots); pricing = p; }
  synchronized Optional<Ticket> park(Vehicle v, long nowMin) {
    if (active.containsKey(v.plate)) throw new IllegalStateException("already parked");
    Spot best = null;                                    // smallest spot that fits keeps big spots free
    for (Spot s : spots) if (s.fits(v) && (best == null || s.size.ordinal() < best.size.ordinal())) best = s;
    if (best == null) return Optional.empty();
    best.parked = v; Ticket t = new Ticket("T" + (++seq), v, best, nowMin); active.put(v.plate, t); return Optional.of(t);
  }
  synchronized double exit(String plate, long nowMin) {
    Ticket t = active.remove(plate); if (t == null) throw new IllegalArgumentException("no ticket");
    t.spot.parked = null; return pricing.price(nowMin - t.entry, t.vehicle.type);
  }
}
public class Main {
  public static void main(String[] a) {
    ParkingLot lot = new ParkingLot(List.of(new Spot(1, VehicleType.BIKE), new Spot(2, VehicleType.CAR), new Spot(3, VehicleType.TRUCK)), new HourlyPricing());
    System.out.println(lot.park(new Car("KA-01"), 0).map(t -> "parked in spot " + t.spot.id).orElse("full"));
    System.out.println(lot.park(new Car("KA-02"), 5).map(t -> "parked in spot " + t.spot.id).orElse("full"));
    System.out.println(lot.park(new Truck("KA-03"), 6).map(t -> "parked in spot " + t.spot.id).orElse("full"));
    System.out.println("fee " + lot.exit("KA-01", 130));
  }
}`,
    [F("How do you handle two cars arriving at once?", "Make park() atomic (synchronized, or a lock per spot / optimistic update) so two threads cannot take the same spot. At scale keep free spots in a concurrent queue per size."), F("How would you add EV charging spots or reserved spots?", "Add a SpotType (or capabilities) to Spot and extend fits(); keep the search in a SpotAllocationStrategy so the lot does not change."), F("How do you find a spot fast in a big lot?", "Keep a free-spot set per size (TreeSet or queue) instead of scanning; nearest-to-entrance is a priority queue by distance."), F("How would this become a distributed system?", "One service per lot, tickets in a database, a payment service, and a display board fed by events. That is the system-design version of the same problem.")],
    ["Clear entities (Vehicle, Spot, Ticket, Lot)", "Pricing separated with Strategy", "Handles full lot and double parking", "Thread safety", "Extensible to new vehicle or spot types"]));

  items.push(L("elevator", "Elevator system", "Design the control system for a building with several elevators.",
    ["Request an elevator from a floor (up or down)", "Choose a floor inside the elevator", "Several elevators share the work", "Move efficiently (do not zig-zag)"],
    ["Direction|enum|UP; DOWN; IDLE|", "Elevator|class|id; floor; direction; stops|addStop(f); step()", "DispatchStrategy|interface||pick(elevators, floor, direction)", "NearestDispatch|class||pick(...)", "Controller|class|elevators; strategy|request(floor, dir); tick()"],
    [["NearestDispatch", "DispatchStrategy", "implements"], ["Controller", "Elevator", "has", "many"], ["Controller", "DispatchStrategy", "uses"], ["Elevator", "Direction", "uses"]],
    [["Strategy", "Different dispatch policies (nearest, least loaded, zoned)."], ["State (optional)", "Moving up, moving down, idle, doors open, out of service."], ["SCAN algorithm", "Keep going in one direction serving stops, then reverse: fewer reversals."]],
    R`import java.util.*;

enum Direction { UP, DOWN, IDLE }
class Elevator {
  final int id; int floor = 0; Direction dir = Direction.IDLE; final TreeSet<Integer> stops = new TreeSet<>();
  Elevator(int id) { this.id = id; }
  void addStop(int f) { if (f != floor) stops.add(f); }
  void step() {
    if (stops.isEmpty()) { dir = Direction.IDLE; return; }
    if (dir == Direction.IDLE) dir = stops.first() > floor ? Direction.UP : Direction.DOWN;
    if (dir == Direction.UP && stops.ceiling(floor) == null) dir = Direction.DOWN;     // nothing above: reverse
    if (dir == Direction.DOWN && stops.floor(floor) == null) dir = Direction.UP;
    floor += dir == Direction.UP ? 1 : -1;
    if (stops.remove(floor)) System.out.println("  elevator " + id + " opens at floor " + floor);
    if (stops.isEmpty()) dir = Direction.IDLE;
  }
  int cost(int target) { return Math.abs(floor - target) + stops.size() * 2; }
}
interface DispatchStrategy { Elevator pick(List<Elevator> els, int floor, Direction d); }
class NearestDispatch implements DispatchStrategy {
  public Elevator pick(List<Elevator> els, int floor, Direction d) { return Collections.min(els, Comparator.comparingInt(e -> e.cost(floor))); }
}
class Controller {
  private final List<Elevator> els = new ArrayList<>(); private final DispatchStrategy strategy;
  Controller(int n, DispatchStrategy s) { for (int i = 0; i < n; i++) els.add(new Elevator(i)); strategy = s; }
  void request(int floor, Direction d) { Elevator e = strategy.pick(els, floor, d); e.addStop(floor); System.out.println("floor " + floor + " assigned to elevator " + e.id); }
  void select(int elevator, int floor) { els.get(elevator).addStop(floor); }
  void tick() { for (Elevator e : els) e.step(); }
}
public class Main {
  public static void main(String[] args) {
    Controller c = new Controller(2, new NearestDispatch());
    c.request(3, Direction.UP); c.request(1, Direction.UP); c.select(0, 5);
    for (int t = 0; t < 8; t++) c.tick();
  }
}`,
    [F("How do you avoid one elevator taking all requests?", "Include its current load (pending stops) in the cost, as cost() does, or use zoning."), F("What about rush hour?", "Predictive parking: idle elevators return to the lobby in the morning and to busy floors otherwise; batch requests to the same direction."), F("How do you model doors, overload and emergencies?", "Add states (DoorsOpen, Overloaded, OutOfService) with the State pattern; requests skip out-of-service cars."), F("How is this tested?", "Tick-based simulation is deterministic: call tick() and assert floors and stop order.")],
    ["Separate controller, elevator and dispatch policy", "Efficient movement (SCAN) not FIFO", "Handles up/down requests separately", "Extensible strategy", "Testable without real time"]));

  items.push(L("vending", "Vending machine", "Design a vending machine that sells items for coins.",
    ["Show items and prices", "Insert money, select an item, get the item and change", "Handle out of stock and cancel", "Refill by an operator"],
    ["VendingMachine|class|state; inventory; balance|insert(c); select(code); cancel()", "State|interface||insert(m, c); select(m, code); cancel(m)", "IdleState|class||", "HasMoneyState|class||", "Item|class|code; name; price; qty|"],
    [["IdleState", "State", "implements"], ["HasMoneyState", "State", "implements"], ["VendingMachine", "State", "has", "current"], ["VendingMachine", "Item", "has", "inventory"]],
    [["State", "Behaviour depends on state (idle, has money); each state handles the same actions differently, replacing big if-else chains."]],
    R`import java.util.*;

class Item { final String name; final int price; int qty; Item(String n, int p, int q) { name = n; price = p; qty = q; } }
interface State { void insert(VendingMachine m, int coin); void select(VendingMachine m, String code); void cancel(VendingMachine m); }
class VendingMachine {
  final Map<String, Item> inventory = new HashMap<>(); int balance = 0; State state = new IdleState();
  void add(String code, Item i) { inventory.put(code, i); }
  void insert(int c) { state.insert(this, c); } void select(String code) { state.select(this, code); } void cancel() { state.cancel(this); }
}
class IdleState implements State {
  public void insert(VendingMachine m, int coin) { m.balance += coin; m.state = new HasMoneyState(); System.out.println("balance " + m.balance); }
  public void select(VendingMachine m, String code) { System.out.println("insert money first"); }
  public void cancel(VendingMachine m) { System.out.println("nothing to cancel"); }
}
class HasMoneyState implements State {
  public void insert(VendingMachine m, int coin) { m.balance += coin; System.out.println("balance " + m.balance); }
  public void select(VendingMachine m, String code) {
    Item i = m.inventory.get(code);
    if (i == null || i.qty == 0) { System.out.println("unavailable"); return; }
    if (m.balance < i.price) { System.out.println("need " + (i.price - m.balance) + " more"); return; }
    i.qty--; int change = m.balance - i.price; m.balance = 0; m.state = new IdleState();
    System.out.println("dispensed " + i.name + ", change " + change);
  }
  public void cancel(VendingMachine m) { System.out.println("refunded " + m.balance); m.balance = 0; m.state = new IdleState(); }
}
public class Main {
  public static void main(String[] a) {
    VendingMachine m = new VendingMachine(); m.add("A1", new Item("Chips", 30, 1));
    m.select("A1"); m.insert(20); m.select("A1"); m.insert(20); m.select("A1"); m.insert(50); m.select("A1");
  }
}`,
    [F("Why the State pattern?", "Each state has different rules for the same events. Adding a state (out of service, maintenance) means adding a class, not editing every if-else."), F("How do you make change with limited coins?", "Greedy over denominations held in a map; if exact change is impossible, refuse or refund. Greedy is optimal for standard coin systems."), F("What about a failed dispense?", "Use a Dispensing state and a refund path so money is never taken without an item; log the event.")],
    ["State pattern instead of flags", "Handles insufficient money and no stock", "Refund and change logic", "Inventory decrement", "Extensible states"]));

  items.push(L("atm", "ATM", "Design an ATM that authenticates a card, checks balance and dispenses cash.",
    ["Insert card, enter PIN", "Check balance, withdraw, deposit", "Dispense the fewest notes", "Handle wrong PIN and insufficient cash"],
    ["ATM|class|state; bank; dispenser|insertCard(c); enterPin(p); withdraw(amount)", "ATMState|interface||", "NoCard|class||", "HasCard|class||", "Authenticated|class||", "Bank|class|accounts|verify(card, pin); debit(card, amt)", "NoteDispenser|abstract|note; next|dispense(amount)", "Dispenser100|class||", "Dispenser50|class||", "Dispenser20|class||"],
    [["NoCard", "ATMState", "implements"], ["HasCard", "ATMState", "implements"], ["Authenticated", "ATMState", "implements"], ["ATM", "ATMState", "has"], ["ATM", "Bank", "uses"], ["ATM", "NoteDispenser", "has"], ["Dispenser100", "NoteDispenser", "extends"], ["Dispenser50", "NoteDispenser", "extends"], ["Dispenser20", "NoteDispenser", "extends"]],
    [["State", "NoCard, HasCard, Authenticated."], ["Chain of Responsibility", "Each note handler dispenses what it can and passes the rest on."]],
    R`import java.util.*;

class Bank {
  private final Map<String, String> pins = new HashMap<>(); private final Map<String, Integer> balance = new HashMap<>();
  void open(String card, String pin, int amount) { pins.put(card, pin); balance.put(card, amount); }
  boolean verify(String card, String pin) { return pin.equals(pins.get(card)); }
  boolean debit(String card, int amt) { int b = balance.getOrDefault(card, 0); if (b < amt) return false; balance.put(card, b - amt); return true; }
  int balance(String card) { return balance.get(card); }
}
abstract class NoteDispenser {
  final int note; int count; NoteDispenser next;
  NoteDispenser(int note, int count) { this.note = note; this.count = count; }
  boolean canDispense(int amount) {
    int use = Math.min(count, amount / note), rest = amount - use * note;
    return rest == 0 || (next != null && next.canDispense(rest));
  }
  void dispense(int amount) {
    int use = Math.min(count, amount / note); count -= use;
    if (use > 0) System.out.println("  " + use + " x " + note);
    int rest = amount - use * note; if (rest > 0 && next != null) next.dispense(rest);
  }
}
class D100 extends NoteDispenser { D100(int c) { super(100, c); } }
class D50 extends NoteDispenser { D50(int c) { super(50, c); } }
class D20 extends NoteDispenser { D20(int c) { super(20, c); } }
class ATM {
  enum S { NO_CARD, HAS_CARD, AUTH }
  private S state = S.NO_CARD; private String card; private final Bank bank; private final NoteDispenser chain;
  ATM(Bank b, NoteDispenser c) { bank = b; chain = c; }
  void insertCard(String c) { if (state != S.NO_CARD) { System.out.println("card already in"); return; } card = c; state = S.HAS_CARD; }
  void enterPin(String p) { if (state != S.HAS_CARD) return; if (bank.verify(card, p)) state = S.AUTH; else { System.out.println("wrong pin, card ejected"); eject(); } }
  void withdraw(int amount) {
    if (state != S.AUTH) { System.out.println("not authenticated"); return; }
    if (!chain.canDispense(amount)) { System.out.println("machine cannot dispense " + amount); return; }
    if (!bank.debit(card, amount)) { System.out.println("insufficient funds"); return; }
    chain.dispense(amount); System.out.println("balance " + bank.balance(card));
  }
  void eject() { card = null; state = S.NO_CARD; }
}
public class Main {
  public static void main(String[] args) {
    Bank b = new Bank(); b.open("C1", "1234", 1000);
    D100 d100 = new D100(5); D50 d50 = new D50(5); D20 d20 = new D20(10); d100.next = d50; d50.next = d20;
    ATM atm = new ATM(b, d100);
    atm.insertCard("C1"); atm.enterPin("1234"); atm.withdraw(270); atm.withdraw(5000); atm.withdraw(35);
  }
}`,
    [F("How do you prevent a double debit if the network fails?", "Make the debit idempotent with a transaction ID, and record dispense outcome; reconcile if cash was not dispensed."), F("Why check canDispense before debiting?", "Never take money for cash you cannot hand out; check first, debit, then dispense, and reverse the debit if dispensing fails."), F("How would you support a different currency or notes?", "Notes are data in the chain; build the chain from configuration in descending order.")],
    ["State handling (card, PIN, authenticated)", "Chain of responsibility for notes", "Check machine cash before debiting", "Security (PIN attempts)", "Clear separation ATM vs Bank"]));

  items.push(L("library", "Library management", "Design a library system for books, members, loans and fines.",
    ["Search books by title or author", "Members borrow and return copies", "Limit loans per member", "Fines for late returns"],
    ["Book|class|isbn; title; author|", "BookCopy|class|id; book; available|", "Member|class|id; name; loans|", "Loan|class|copy; member; due; returned|", "Library|class|books; copies; loans|search(q); checkout(m, id, day); giveBack(id, day)", "FinePolicy|interface||fine(daysLate)", "PerDayFine|class|rate|fine(daysLate)"],
    [["PerDayFine", "FinePolicy", "implements"], ["Library", "BookCopy", "has", "many"], ["BookCopy", "Book", "uses"], ["Loan", "BookCopy", "uses"], ["Loan", "Member", "uses"], ["Library", "FinePolicy", "uses"]],
    [["Strategy", "Fine calculation can change (per day, capped, by membership type)."], ["Separate Book from BookCopy", "A title has many physical copies; a loan is for one copy."]],
    R`import java.util.*;

class Book { final String isbn, title, author; Book(String i, String t, String a) { isbn = i; title = t; author = a; } }
class BookCopy { final String id; final Book book; boolean available = true; BookCopy(String id, Book b) { this.id = id; book = b; } }
class Member { final String id, name; final List<Loan> loans = new ArrayList<>(); Member(String i, String n) { id = i; name = n; } }
class Loan { final BookCopy copy; final Member member; final int due; boolean returned; Loan(BookCopy c, Member m, int due) { copy = c; member = m; this.due = due; } }
interface FinePolicy { double fine(int daysLate); }
class PerDayFine implements FinePolicy { private final double rate; PerDayFine(double r) { rate = r; } public double fine(int d) { return d <= 0 ? 0 : d * rate; } }
class Library {
  static final int MAX_LOANS = 3, LOAN_DAYS = 14;
  private final List<BookCopy> copies = new ArrayList<>(); private final Map<String, Loan> byCopy = new HashMap<>(); private final FinePolicy fines;
  Library(FinePolicy f) { fines = f; }
  void add(Book b, int n) { for (int i = 0; i < n; i++) copies.add(new BookCopy(b.isbn + "-" + i, b)); }
  List<Book> search(String q) { Set<Book> out = new LinkedHashSet<>(); for (BookCopy c : copies) if ((c.book.title + " " + c.book.author).toLowerCase().contains(q.toLowerCase())) out.add(c.book); return new ArrayList<>(out); }
  Loan checkout(Member m, String isbn, int day) {
    long active = m.loans.stream().filter(l -> !l.returned).count();
    if (active >= MAX_LOANS) throw new IllegalStateException("loan limit reached");
    for (BookCopy c : copies) if (c.book.isbn.equals(isbn) && c.available) { c.available = false; Loan l = new Loan(c, m, day + LOAN_DAYS); m.loans.add(l); byCopy.put(c.id, l); return l; }
    throw new IllegalStateException("no copy available");
  }
  double giveBack(String copyId, int day) {
    Loan l = byCopy.remove(copyId); l.returned = true; l.copy.available = true; return fines.fine(day - l.due);
  }
}
public class Main {
  public static void main(String[] a) {
    Library lib = new Library(new PerDayFine(2)); Book b = new Book("111", "Clean Code", "Martin"); lib.add(b, 1);
    Member m = new Member("m1", "Asha");
    Loan l = lib.checkout(m, "111", 0); System.out.println("borrowed " + l.copy.id + ", due day " + l.due);
    try { lib.checkout(m, "111", 1); } catch (IllegalStateException e) { System.out.println(e.getMessage()); }
    System.out.println("fine " + lib.giveBack(l.copy.id, 20)); System.out.println(lib.search("clean").size() + " match");
  }
}`,
    [F("How do you handle reservations?", "A Reservation queue per book; when a copy returns, the first reserver is notified (Observer) and the copy is held for a limited time."), F("How would search scale?", "Index titles and authors (an inverted index or a search engine) instead of scanning; the class design stays the same behind a SearchService."), F("How do you keep counts correct with two librarians at once?", "Make checkout atomic per copy (lock or optimistic version check).")],
    ["Book vs physical copy", "Loan as its own entity", "Limits and fines separated (Strategy)", "Clear errors for edge cases", "Search abstraction"]));

  items.push(L("tictactoe", "Tic-tac-toe", "Design tic-tac-toe, extensible to an N x N board.",
    ["Two players take turns", "Detect a win, draw or invalid move", "Board size N", "Efficient win check"],
    ["Game|class|board; players; turn; winner|play(row, col)", "Board|class|n; grid; rows; cols; diag; anti|place(row, col, p)", "Player|class|name; mark|", "Mark|enum|X; O|"],
    [["Game", "Board", "has"], ["Game", "Player", "has", "2"], ["Player", "Mark", "uses"]],
    [["Counters", "Keep a count per row, column and diagonal so a win is detected in O(1) per move instead of scanning the board."]],
    R`class Player { final String name; final char mark; Player(String n, char m) { name = n; mark = m; } }
class Board {
  final int n; final char[][] grid; final int[] rows, cols; int diag, anti, moves;
  Board(int n) { this.n = n; grid = new char[n][n]; rows = new int[n]; cols = new int[n]; }
  boolean place(int r, int c, int v) {                  // v is +1 for one player, -1 for the other
    if (r < 0 || c < 0 || r >= n || c >= n || grid[r][c] != 0) return false;
    grid[r][c] = v > 0 ? 'X' : 'O'; moves++; rows[r] += v; cols[c] += v; if (r == c) diag += v; if (r + c == n - 1) anti += v;
    return true;
  }
  boolean won(int r, int c) { return Math.abs(rows[r]) == n || Math.abs(cols[c]) == n || Math.abs(diag) == n || Math.abs(anti) == n; }
}
class Game {
  private final Board board; private final Player[] players; private int turn = 0; String result = null;
  Game(int n, Player a, Player b) { board = new Board(n); players = new Player[] { a, b }; }
  String play(int r, int c) {
    if (result != null) return "game over: " + result;
    if (!board.place(r, c, turn == 0 ? 1 : -1)) return "invalid move";
    if (board.won(r, c)) { result = players[turn].name + " wins"; return result; }
    if (board.moves == board.n * board.n) { result = "draw"; return result; }
    turn = 1 - turn; return "ok";
  }
}
public class Main {
  public static void main(String[] args) {
    Game g = new Game(3, new Player("Asha", 'X'), new Player("Ravi", 'O'));
    int[][] moves = { { 0, 0 }, { 1, 1 }, { 0, 1 }, { 2, 2 }, { 0, 2 } };
    for (int[] m : moves) System.out.println(g.play(m[0], m[1]));
    System.out.println(g.play(0, 0));
  }
}`,
    [F("How would you add an AI player?", "Introduce a PlayerStrategy (human input, random, minimax) that returns a move; Game asks the current player for it."), F("How do you support undo?", "Keep a move stack and reverse the counters (Command pattern)."), F("Win condition of 5 in a row on a big board?", "Counters no longer work; check the four directions around the last move only, counting consecutive marks.")],
    ["Clean Game, Board, Player split", "O(1) win detection", "Validation of moves", "Extensible board size", "Turn and end-of-game handling"]));

  items.push(L("chess", "Chess", "Design the core of a chess game: pieces, board and legal moves.",
    ["Board 8x8 with pieces", "Each piece has its own movement rule", "Players alternate turns", "Cannot jump over pieces (except the knight)"],
    ["Piece|abstract|color|canMove(board, from, to)", "Rook|class||", "Bishop|class||", "Knight|class||", "Queen|class||", "King|class||", "Pawn|class||", "Board|class|cells|pieceAt(p); move(from, to)", "Game|class|board; turn|move(from, to)", "Pos|class|row; col|"],
    [["Rook", "Piece", "extends"], ["Bishop", "Piece", "extends"], ["Knight", "Piece", "extends"], ["Queen", "Piece", "extends"], ["King", "Piece", "extends"], ["Pawn", "Piece", "extends"], ["Board", "Piece", "has", "many"], ["Game", "Board", "has"]],
    [["Polymorphism", "Each piece answers canMove itself; the board never checks piece types."], ["Template method (optional)", "Sliding pieces share the 'path is clear' check."]],
    R`abstract class Piece {
  final boolean white; Piece(boolean w) { white = w; }
  abstract boolean canMove(Board b, int r1, int c1, int r2, int c2);
  static boolean clearPath(Board b, int r1, int c1, int r2, int c2) {
    int dr = Integer.signum(r2 - r1), dc = Integer.signum(c2 - c1);
    for (int r = r1 + dr, c = c1 + dc; r != r2 || c != c2; r += dr, c += dc) if (b.at(r, c) != null) return false;
    return true;
  }
}
class Rook extends Piece { Rook(boolean w) { super(w); } boolean canMove(Board b, int r1, int c1, int r2, int c2) { return (r1 == r2 || c1 == c2) && clearPath(b, r1, c1, r2, c2); } }
class Bishop extends Piece { Bishop(boolean w) { super(w); } boolean canMove(Board b, int r1, int c1, int r2, int c2) { return Math.abs(r1 - r2) == Math.abs(c1 - c2) && clearPath(b, r1, c1, r2, c2); } }
class Queen extends Piece { Queen(boolean w) { super(w); } boolean canMove(Board b, int r1, int c1, int r2, int c2) { return new Rook(white).canMove(b, r1, c1, r2, c2) || new Bishop(white).canMove(b, r1, c1, r2, c2); } }
class Knight extends Piece { Knight(boolean w) { super(w); } boolean canMove(Board b, int r1, int c1, int r2, int c2) { int dr = Math.abs(r1 - r2), dc = Math.abs(c1 - c2); return dr * dc == 2; } }
class King extends Piece { King(boolean w) { super(w); } boolean canMove(Board b, int r1, int c1, int r2, int c2) { return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2)) == 1; } }
class Pawn extends Piece {
  Pawn(boolean w) { super(w); }
  boolean canMove(Board b, int r1, int c1, int r2, int c2) {
    int dir = white ? 1 : -1, start = white ? 1 : 6;
    if (c1 == c2 && b.at(r2, c2) == null) return r2 - r1 == dir || (r1 == start && r2 - r1 == 2 * dir && b.at(r1 + dir, c1) == null);
    return Math.abs(c1 - c2) == 1 && r2 - r1 == dir && b.at(r2, c2) != null;      // capture
  }
}
class Board {
  private final Piece[][] cells = new Piece[8][8];
  Piece at(int r, int c) { return cells[r][c]; }
  void put(int r, int c, Piece p) { cells[r][c] = p; }
  boolean move(boolean whiteTurn, int r1, int c1, int r2, int c2) {
    Piece p = at(r1, c1); if (p == null || p.white != whiteTurn) return false;
    Piece target = at(r2, c2); if (target != null && target.white == p.white) return false;
    if (!p.canMove(this, r1, c1, r2, c2)) return false;
    cells[r2][c2] = p; cells[r1][c1] = null; return true;
  }
}
public class Main {
  public static void main(String[] a) {
    Board b = new Board(); b.put(0, 0, new Rook(true)); b.put(1, 4, new Pawn(true)); b.put(0, 1, new Knight(true));
    System.out.println("rook up blocked? " + !b.move(true, 0, 0, 0, 3));
    System.out.println("knight jumps: " + b.move(true, 0, 1, 2, 2));
    System.out.println("pawn two squares: " + b.move(true, 1, 4, 3, 4));
    System.out.println("pawn sideways: " + b.move(true, 3, 4, 3, 5));
  }
}`,
    [F("How do you detect check and checkmate?", "After a candidate move, see whether the mover's king is attacked by any opposing piece; checkmate is check with no legal move that resolves it."), F("How do you handle castling and en passant?", "Special moves live in Game or a MoveValidator that knows history; pieces stay simple."), F("How would you add undo and move history?", "Store each move as a Command with captured piece, so it can be reversed.")],
    ["Polymorphic piece rules", "Path checking", "Turn and capture rules", "Extensible (special moves, check)", "Board does not know piece types"]));

  items.push(L("lru", "LRU cache", "Design a cache that evicts the least recently used entry, with O(1) get and put.",
    ["get(key) and put(key, value)", "Fixed capacity", "Evict the least recently used item when full", "O(1) time"],
    ["LRUCache|class|capacity; map; head; tail|get(k); put(k, v)", "Node|class|key; value; prev; next|"],
    [["LRUCache", "Node", "has", "many"]],
    [["HashMap + doubly linked list", "The map finds a node in O(1); the list moves it to the front in O(1) and removes the tail in O(1)."]],
    R`import java.util.*;

class LRUCache<K, V> {
  private class Node { K key; V value; Node prev, next; Node(K k, V v) { key = k; value = v; } }
  private final int capacity; private final Map<K, Node> map = new HashMap<>();
  private final Node head = new Node(null, null), tail = new Node(null, null);         // sentinels avoid null checks
  LRUCache(int capacity) { this.capacity = capacity; head.next = tail; tail.prev = head; }
  synchronized V get(K key) { Node n = map.get(key); if (n == null) return null; unlink(n); pushFront(n); return n.value; }
  synchronized void put(K key, V value) {
    Node n = map.get(key);
    if (n != null) { n.value = value; unlink(n); pushFront(n); return; }
    if (map.size() == capacity) { Node lru = tail.prev; unlink(lru); map.remove(lru.key); }
    n = new Node(key, value); map.put(key, n); pushFront(n);
  }
  private void unlink(Node n) { n.prev.next = n.next; n.next.prev = n.prev; }
  private void pushFront(Node n) { n.next = head.next; n.prev = head; head.next.prev = n; head.next = n; }
}
public class Main {
  public static void main(String[] a) {
    LRUCache<String, Integer> c = new LRUCache<>(2);
    c.put("a", 1); c.put("b", 2); c.get("a"); c.put("c", 3);
    System.out.println("b evicted: " + (c.get("b") == null) + ", a kept: " + c.get("a") + ", c kept: " + c.get("c"));
  }
}`,
    [F("How is it thread safe and fast?", "A single lock is simplest; for throughput shard the cache into several LRU segments by key hash, each with its own lock."), F("What about a TTL?", "Store an expiry time in the node and treat expired entries as misses; also remove them lazily or with a background sweep."), F("Other eviction policies?", "Make eviction a strategy (LRU, LFU, FIFO). LFU needs frequency buckets to stay O(1)."), F("Java shortcut?", "LinkedHashMap with accessOrder=true and removeEldestEntry gives LRU in a few lines; interviewers still want the manual version.")],
    ["O(1) get and put", "Correct pointer handling", "Capacity and eviction", "Thread safety discussion", "Extensible eviction policy"]));

  items.push(L("ratelimiter", "Rate limiter (class design)", "Design a rate limiter library with pluggable algorithms.",
    ["allow(key) returns true or false", "Different limits per key", "Pluggable algorithms (token bucket, sliding window)", "Thread safe"],
    ["RateLimiter|interface||allow(key, nowMs)", "TokenBucket|class|capacity; refillPerSec; buckets|allow(key, nowMs)", "SlidingWindowLog|class|limit; windowMs; logs|allow(key, nowMs)", "LimiterFactory|class||create(type, ...)"],
    [["TokenBucket", "RateLimiter", "implements"], ["SlidingWindowLog", "RateLimiter", "implements"], ["LimiterFactory", "RateLimiter", "uses"]],
    [["Strategy", "The algorithm behind the RateLimiter interface can change."], ["Factory", "Build a limiter from configuration."]],
    R`import java.util.*;

interface RateLimiter { boolean allow(String key, long nowMs); }
class TokenBucket implements RateLimiter {
  private final double capacity, refillPerMs; private final Map<String, double[]> buckets = new HashMap<>();   // [tokens, lastRefill]
  TokenBucket(double capacity, double refillPerSec) { this.capacity = capacity; refillPerMs = refillPerSec / 1000.0; }
  public synchronized boolean allow(String key, long now) {
    double[] b = buckets.computeIfAbsent(key, k -> new double[] { capacity, now });
    b[0] = Math.min(capacity, b[0] + (now - b[1]) * refillPerMs); b[1] = now;
    if (b[0] < 1) return false; b[0] -= 1; return true;
  }
}
class SlidingWindowLog implements RateLimiter {
  private final int limit; private final long windowMs; private final Map<String, Deque<Long>> logs = new HashMap<>();
  SlidingWindowLog(int limit, long windowMs) { this.limit = limit; this.windowMs = windowMs; }
  public synchronized boolean allow(String key, long now) {
    Deque<Long> q = logs.computeIfAbsent(key, k -> new ArrayDeque<>());
    while (!q.isEmpty() && q.peekFirst() <= now - windowMs) q.pollFirst();
    if (q.size() >= limit) return false; q.addLast(now); return true;
  }
}
public class Main {
  public static void main(String[] a) {
    RateLimiter tb = new TokenBucket(3, 1);
    StringBuilder sb = new StringBuilder(); for (int i = 0; i < 5; i++) sb.append(tb.allow("u", 0) ? "Y" : "N"); System.out.println("burst of 5: " + sb + ", after 2s: " + tb.allow("u", 2000));
    RateLimiter sw = new SlidingWindowLog(2, 1000); System.out.println(sw.allow("k", 0) + " " + sw.allow("k", 100) + " " + sw.allow("k", 200) + " " + sw.allow("k", 1100));
  }
}`,
    [F("Token bucket or sliding window?", "Token bucket allows bursts up to capacity at a steady average and uses tiny state; sliding window log is exact but stores every timestamp; sliding window counter approximates it cheaply."), F("How do you make it work across servers?", "Keep the counters in a shared store like Redis with an atomic script; accept small drift if you use local approximations."), F("What if the store is down?", "Decide fail open or fail closed per API; keep a local fallback limit.")],
    ["Strategy behind an interface", "Correct refill maths", "Per-key state", "Thread safety", "Distributed discussion"]));

  items.push(L("logger", "Logging framework", "Design a logging library with levels and several destinations.",
    ["Levels: DEBUG, INFO, WARN, ERROR", "Multiple appenders (console, file, remote)", "Filter by minimum level", "One shared logger instance"],
    ["Logger|class|level; appenders|log(level, msg); addAppender(a)", "Level|enum|DEBUG; INFO; WARN; ERROR|", "Appender|interface||append(entry)", "ConsoleAppender|class||", "MemoryAppender|class|entries|", "Formatter|interface||format(entry)"],
    [["ConsoleAppender", "Appender", "implements"], ["MemoryAppender", "Appender", "implements"], ["Logger", "Appender", "has", "many"], ["Logger", "Level", "uses"], ["Appender", "Formatter", "uses"]],
    [["Singleton", "One logger per name from a registry (getLogger)."], ["Observer", "Appenders subscribe to log events."], ["Strategy", "Formatter decides how an entry is written."]],
    R`import java.util.*;

enum Level { DEBUG, INFO, WARN, ERROR }
interface Appender { void append(Level level, String msg); }
class ConsoleAppender implements Appender { public void append(Level l, String m) { System.out.println("[" + l + "] " + m); } }
class MemoryAppender implements Appender {
  final List<String> entries = new ArrayList<>();
  public void append(Level l, String m) { entries.add(l + ":" + m); }
}
class Logger {
  private static final Map<String, Logger> registry = new HashMap<>();
  private Level min = Level.INFO; private final List<Appender> appenders = new ArrayList<>(); private final String name;
  private Logger(String name) { this.name = name; }
  static synchronized Logger get(String name) { return registry.computeIfAbsent(name, Logger::new); }
  void setLevel(Level l) { min = l; }
  void addAppender(Appender a) { appenders.add(a); }
  void log(Level l, String msg) { if (l.ordinal() < min.ordinal()) return; for (Appender a : appenders) a.append(l, name + " " + msg); }
  void info(String m) { log(Level.INFO, m); } void error(String m) { log(Level.ERROR, m); } void debug(String m) { log(Level.DEBUG, m); }
}
public class Main {
  public static void main(String[] a) {
    Logger log = Logger.get("orders"); MemoryAppender mem = new MemoryAppender(); log.addAppender(new ConsoleAppender()); log.addAppender(mem);
    log.debug("hidden"); log.info("created"); log.error("failed");
    System.out.println("same instance: " + (log == Logger.get("orders")) + ", stored " + mem.entries.size());
  }
}`,
    [F("How do you make logging not slow the app?", "Log asynchronously: the caller enqueues the entry and a background thread writes it; drop or sample under pressure."), F("Log levels per package?", "A hierarchy of loggers (a.b inherits from a) with level inheritance, as in Log4j."), F("How do you rotate files?", "The file appender checks size or date on write and rolls over to a new file.")],
    ["Level filtering", "Pluggable appenders", "Singleton/registry done safely", "Extensible formatting", "Async discussion"]));

  return items;
});
