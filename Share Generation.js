function generateShares(secret, n, k) {
    // Generate k-1 random coefficients
    const coefficients = [parseFloat(secret)];
    for (let i = 1; i < k; i++) {
        coefficients.push(Math.random() * 1000);
    }
    
    // Generate n shares
    const shares = [];
    for (let x = 1; x <= n; x++) {
        const y = evaluatePolynomial(coefficients, x);
        const hash = createHash(x, y);
        shares.push({x: x, y: y, hash: hash});
    }
    return shares;
}