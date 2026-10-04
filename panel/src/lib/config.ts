/**
 * Anyone who can reach the platform address could otherwise create panels
 * (spam, squatting names, filling the database). Off unless the operator turns it on;
 * normally the operator creates panels for customers with `npm run ops`.
 */
export const publicSignupEnabled = () => process.env.ALLOW_PUBLIC_SIGNUP === "true";
