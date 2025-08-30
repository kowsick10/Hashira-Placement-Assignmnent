import java.util.*;

public class SecretConstant {
    // Returns f(0) given k = m+1 sample points from a degree-m polynomial.
    public static double constantTerm(double[] xs, double[] ys) {
        int k = xs.length;
        double result = 0.0;
        for (int i = 0; i < k; i++) {
            double li0 = 1.0;
            for (int j = 0; j < k; j++) {
                if (i == j) continue;
                double denom = xs[i] - xs[j];
                if (denom == 0.0) throw new IllegalArgumentException("x values must be distinct");
                li0 *= (-xs[j]) / denom;
            }
            result += ys[i] * li0;
        }
        return result;
    }

    // Demo
    public static void main(String[] args) {
        // Example: f(x) = 2x^2 - 3x + 5, so constant term = 5
        double[] xs = {1, 2, 3};
        double[] ys = {2*1*1 - 3*1 + 5, 2*4 - 3*2 + 5, 2*9 - 3*3 + 5}; // {4, 7, 14}
        System.out.println(constantTerm(xs, ys)); // ~5.0
    }
}
