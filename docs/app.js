"use strict";

const MAX_EXPRESSION_LENGTH = 300;
const MAX_TOKENS = 200;

function tokenize(source) {
  if (typeof source !== "string" || source.length === 0 || source.length > MAX_EXPRESSION_LENGTH) {
    throw new Error("Invalid expression length");
  }

  const tokens = [];
  let position = 0;

  while (position < source.length) {
    const remaining = source.slice(position);
    const character = source[position];

    if (/\s/.test(character)) {
      position += 1;
      continue;
    }

    const numberMatch = remaining.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (numberMatch) {
      const value = Number(numberMatch[0]);
      if (!Number.isFinite(value)) throw new Error("Number is too large");
      tokens.push({ type: "number", value });
      position += numberMatch[0].length;
      continue;
    }

    const nameMatch = remaining.match(/^[A-Za-z_]+/);
    if (nameMatch) {
      tokens.push({ type: "name", value: nameMatch[0].toLowerCase() });
      position += nameMatch[0].length;
      continue;
    }

    if ("+-*/^()".includes(character)) {
      tokens.push({ type: "symbol", value: character });
      position += 1;
      continue;
    }

    throw new Error("Unsupported character");
  }

  if (tokens.length > MAX_TOKENS) throw new Error("Expression is too complex");
  tokens.push({ type: "end", value: "" });
  return tokens;
}

class ExpressionParser {
  constructor(source, angleMode, answer) {
    this.tokens = tokenize(source);
    this.position = 0;
    this.angleMode = angleMode === "RAD" ? "RAD" : "DEG";
    this.answer = Number.isFinite(answer) ? answer : 0;
  }

  current() {
    return this.tokens[this.position];
  }

  consume(value) {
    if (this.current().value === value) {
      this.position += 1;
      return true;
    }
    return false;
  }

  require(value) {
    if (!this.consume(value)) throw new Error(`Expected ${value}`);
  }

  parse() {
    const value = this.parseExpression();
    if (this.current().type !== "end") throw new Error("Unexpected input");
    return ensureFinite(value);
  }

  parseExpression() {
    let value = this.parseTerm();
    while (this.current().value === "+" || this.current().value === "-") {
      const operator = this.current().value;
      this.position += 1;
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
      value = ensureFinite(value);
    }
    return value;
  }

  parseTerm() {
    let value = this.parseUnary();
    while (this.current().value === "*" || this.current().value === "/") {
      const operator = this.current().value;
      this.position += 1;
      const right = this.parseUnary();
      if (operator === "/" && right === 0) throw new Error("Cannot divide by zero");
      value = operator === "*" ? value * right : value / right;
      value = ensureFinite(value);
    }
    return value;
  }

  parseUnary() {
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return ensureFinite(-this.parseUnary());
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();
    if (!this.consume("^")) return base;
    const exponent = this.parseUnary();
    if (Math.abs(exponent) > 10000) throw new Error("Exponent is too large");
    return ensureFinite(Math.pow(base, exponent));
  }

  parsePrimary() {
    const token = this.current();

    if (token.type === "number") {
      this.position += 1;
      return token.value;
    }

    if (this.consume("(")) {
      const value = this.parseExpression();
      this.require(")");
      return value;
    }

    if (token.type === "name") {
      this.position += 1;
      const name = token.value;
      const constants = { pi: Math.PI, e: Math.E, ans: this.answer };
      if (Object.hasOwn(constants, name)) return constants[name];

      const allowedFunctions = new Set(["sin", "cos", "tan", "sqrt", "log", "ln", "factorial"]);
      if (!allowedFunctions.has(name)) throw new Error("Unknown function");
      this.require("(");
      const argument = this.parseExpression();
      this.require(")");
      return this.applyFunction(name, argument);
    }

    throw new Error("Incomplete expression");
  }

  applyFunction(name, argument) {
    if (name === "sqrt") {
      if (argument < 0) throw new Error("Square root requires a non-negative number");
      return ensureFinite(Math.sqrt(argument));
    }

    if (name === "log" || name === "ln") {
      if (argument <= 0) throw new Error("Logarithm requires a positive number");
      return ensureFinite(name === "log" ? Math.log10(argument) : Math.log(argument));
    }

    if (name === "factorial") {
      if (!Number.isInteger(argument) || argument < 0 || argument > 170) {
        throw new Error("Factorial requires an integer from 0 to 170");
      }
      let result = 1;
      for (let value = 2; value <= argument; value += 1) result *= value;
      return ensureFinite(result);
    }

    const angle = this.angleMode === "DEG" ? argument * Math.PI / 180 : argument;
    if (name === "sin") return ensureFinite(Math.sin(angle));
    if (name === "cos") return ensureFinite(Math.cos(angle));
    if (Math.abs(Math.cos(angle)) < 1e-12) throw new Error("Tangent is undefined");
    return ensureFinite(Math.tan(angle));
  }
}

function ensureFinite(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Result is outside the supported range");
  }
  return value;
}

function evaluateExpression(source, angleMode = "DEG", answer = 0) {
  return new ExpressionParser(source, angleMode, answer).parse();
}

function initializeCalculator() {
  let expression = "";
  let angleMode = "DEG";
  let answer = 0;
  let justEvaluated = false;

  const historyElement = document.getElementById("history");
  const resultElement = document.getElementById("result");
  const modeButton = document.getElementById("modeButton");
  const statusElement = document.getElementById("status");
  const keypadElement = document.getElementById("keypad");

  function pretty(value) {
    return value
      .replaceAll("factorial", "fact")
      .replaceAll("sqrt", "√")
      .replaceAll("pi", "π")
      .replaceAll("*", "×")
      .replaceAll("/", "÷")
      .replaceAll("-", "−");
  }

  function refreshDisplay() {
    historyElement.textContent = "Expression";
    resultElement.textContent = expression ? pretty(expression) : "0";
    resultElement.scrollLeft = resultElement.scrollWidth;
  }

  function endsWithValue() {
    return /(?:\d|\.|\)|pi|e)$/.test(expression);
  }

  function startsFresh() {
    if (justEvaluated) expression = "";
    justEvaluated = false;
  }

  function appendDigit(digit) {
    startsFresh();
    if (/(?:\)|pi|e)$/.test(expression)) expression += "*";
    expression += digit;
    refreshDisplay();
  }

  function appendDecimal() {
    startsFresh();
    const fragment = expression.split(/[+\-*/^()]/).pop();
    if (fragment.includes(".")) return;
    if (!expression || /[+\-*/^(]$/.test(expression)) expression += "0";
    expression += ".";
    refreshDisplay();
  }

  function appendOperator(operator) {
    if (!expression) {
      if (operator === "-") {
        expression = "-";
        refreshDisplay();
      }
      return;
    }
    justEvaluated = false;
    if (/[+\-*/^(]$/.test(expression)) return;
    expression += operator;
    refreshDisplay();
  }

  function appendParenthesis(parenthesis) {
    startsFresh();
    if (parenthesis === "(") {
      if (endsWithValue()) expression += "*";
      expression += "(";
    } else {
      const openings = (expression.match(/\(/g) || []).length;
      const closings = (expression.match(/\)/g) || []).length;
      if (openings > closings && expression && !/[+\-*/^(]$/.test(expression)) expression += ")";
    }
    refreshDisplay();
  }

  function appendFunction(name) {
    startsFresh();
    if (endsWithValue()) expression += "*";
    expression += `${name}(`;
    refreshDisplay();
  }

  function appendConstant(constant) {
    startsFresh();
    if (endsWithValue()) expression += "*";
    expression += constant;
    refreshDisplay();
  }

  function wrapExpression(template) {
    if (!expression) return;
    expression = template(expression);
    justEvaluated = false;
    refreshDisplay();
  }

  function changeSign() {
    if (!expression) expression = "-";
    else if (expression.startsWith("-(") && expression.endsWith(")")) expression = expression.slice(2, -1);
    else expression = `-(${expression})`;
    justEvaluated = false;
    refreshDisplay();
  }

  function backspace() {
    if (justEvaluated) {
      clearAll();
      return;
    }
    const smartTokens = ["factorial(", "sqrt(", "sin(", "cos(", "tan(", "log(", "ln(", "pi"];
    const token = smartTokens.find(item => expression.endsWith(item));
    expression = token ? expression.slice(0, -token.length) : expression.slice(0, -1);
    refreshDisplay();
  }

  function clearAll() {
    expression = "";
    justEvaluated = false;
    historyElement.textContent = "Ready";
    resultElement.textContent = "0";
  }

  function toggleMode() {
    angleMode = angleMode === "DEG" ? "RAD" : "DEG";
    modeButton.textContent = angleMode;
    statusElement.textContent = `${angleMode} mode • Enter = calculate • Esc = clear`;
  }

  function formatResult(value) {
    if (Object.is(value, -0) || value === 0) return "0";
    if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value);
    return Number(value.toPrecision(12)).toString();
  }

  function calculate() {
    if (!expression) return;
    const original = expression;
    try {
      const value = evaluateExpression(original, angleMode, answer);
      answer = value;
      expression = formatResult(value);
      historyElement.textContent = `${pretty(original)} =`;
      resultElement.textContent = expression;
      justEvaluated = true;
    } catch (error) {
      historyElement.textContent = error instanceof Error ? error.message : "Invalid expression";
      resultElement.textContent = "Error";
      expression = "";
      justEvaluated = true;
    }
  }

  const actions = {
    digit: value => appendDigit(value),
    decimal: () => appendDecimal(),
    operator: value => appendOperator(value),
    parenthesis: value => appendParenthesis(value),
    function: value => appendFunction(value),
    constant: value => appendConstant(value),
    square: () => wrapExpression(value => `(${value})^2`),
    percent: () => wrapExpression(value => `(${value})/100`),
    reciprocal: () => wrapExpression(value => `1/(${value})`),
    factorial: () => wrapExpression(value => `factorial(${value})`),
    sign: () => changeSign(),
    backspace: () => backspace(),
    clear: () => clearAll(),
    mode: () => toggleMode(),
    calculate: () => calculate()
  };

  keypadElement.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || !keypadElement.contains(button)) return;
    const action = actions[button.dataset.action];
    if (action) action(button.dataset.value || "");
  });

  document.addEventListener("keydown", event => {
    if (/^[0-9]$/.test(event.key)) appendDigit(event.key);
    else if (event.key === ".") appendDecimal();
    else if (["+", "-", "*", "/"].includes(event.key)) appendOperator(event.key);
    else if (event.key === "^") appendOperator("^");
    else if (event.key === "(") appendParenthesis("(");
    else if (event.key === ")") appendParenthesis(")");
    else if (event.key === "%") wrapExpression(value => `(${value})/100`);
    else if (event.key === "Enter" || event.key === "=") calculate();
    else if (event.key === "Backspace") backspace();
    else if (event.key === "Escape") clearAll();
    else return;
    event.preventDefault();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { evaluateExpression, tokenize };
}

if (typeof document !== "undefined") {
  initializeCalculator();
}
