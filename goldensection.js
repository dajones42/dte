
//	finds the minimun value of func(x) for min<=x<=max using
//	golden section search
let gsOpt= function(min,max,func,tol)
{
	var RATIO2= .61803399;
	var RATIO1= 1-RATIO2;
	if (!tol)
		tol= 1e-4;
	var x0= min;
	var x3= max;
	var x1= RATIO1*x3 + RATIO2*x0;
	var f0= func(x0);
	var f1= func(x1);
	var f3= func(x3);
	while ((f1>f0 || f1>f3) && x3-x0 > tol*Math.abs(x1)) {
		if (f3 > f0) {
			x3= x1;
			f3= f1;
			x1= RATIO1*x3 + RATIO2*x0;
		} else {
			x0= x1;
			f0= f1;
			x1= RATIO2*x3 + RATIO1*x0;
		}
		f1= func(x1);
	}
	var x2= x1 + RATIO2*(x1-x0);
	var f2= func(x2);
	while (x3-x0 > tol*(Math.abs(x1)+Math.abs(x2))) {
		if (f1 < f2) {
			x3= x2;
			x2= x1;
			x1= RATIO2*x0 + RATIO1*x3;
			f2= f1;
			f1= func(x1);
		} else {
			x0= x1;
			x1= x2;
			x2= RATIO2*x3 + RATIO1*x0;
			f1= f2;
			f2= func(x2);
		}
	}
	return f1<f2 ? x1 : x2;
}
