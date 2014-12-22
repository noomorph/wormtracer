function foo() {
    TRACE.onEnter({"fn":"foo","file":"example.js","line":1});
    if (bar()) {
    }
    if (bar2()) {
    }
    TRACE.onExit({"fn":"foo","file":"example.js","line":1});
}
