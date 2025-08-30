function lagrangeInterpolation(shares) {
    let secret = 0;
    const n = shares.length;
    
    for (let i = 0; i < n; i++) {
        let xi = shares[i].x;
        let yi = shares[i].y;
        
        // Calculate Lagrange basis polynomial Li(0)
        let li = 1;
        for (let j = 0; j < n; j++) {
            if (i !== j) {
                let xj = shares[j].x;
                li = preciseMultiply(li, preciseDivide(-xj, xi - xj));
            }
        }
        secret = preciseAdd(secret, preciseMultiply(yi, li));
    }
    return secret;
}