// Custom precision operations
function preciseAdd(a, b) {
    return parseFloat((parseFloat(a) + parseFloat(b)).toFixed(15));
}

function preciseMultiply(a, b) {
    return parseFloat((parseFloat(a) * parseFloat(b)).toFixed(15));
}

function preciseDivide(a, b) {
    if (Math.abs(b) < 1e-15) throw new Error("Division by zero");
    return parseFloat((parseFloat(a) / parseFloat(b)).toFixed(15));
}