import {
  err,
  flatMap,
  map,
  ok,
  type Result,
  sequence,
  traverse,
} from "../../packages/core/result.ts";

console.log("\n=== Result Chaining Examples ===\n");

type User = { id: string; email: string };
type ValidationError = "INVALID_EMAIL" | "EMPTY_ID" | "DUPLICATE_EMAIL";

const validateEmail = (email: string): Result<string, ValidationError> => {
  if (!email.includes("@")) {
    return err("INVALID_EMAIL");
  }
  return ok(email);
};

const validateId = (id: string): Result<string, ValidationError> => {
  if (id.length === 0) {
    return err("EMPTY_ID");
  }
  return ok(id);
};

const createUser = (
  id: string,
  email: string,
): Result<User, ValidationError> => {
  return flatMap(
    validateId(id),
    (validId) =>
      map(validateEmail(email), (validEmail) => ({
        id: validId,
        email: validEmail,
      })),
  );
};

const result1 = createUser("user123", "ada@example.com");
console.log("Valid user:", result1);

const result2 = createUser("user456", "invalid-email");
console.log("Invalid email:", result2);

const result3 = createUser("", "bob@example.com");
console.log("Empty ID:", result3);

console.log("\n=== Sequence: Collecting Results ===\n");

const results = [
  ok(1),
  ok(2),
  ok(3),
];

console.log("All ok:", sequence(results));

const mixedResults = [
  ok(1),
  err("ERROR"),
  ok(3),
];

console.log("With error:", sequence(mixedResults));

console.log("\n=== Traverse: Mapping with Validation ===\n");

const emails = ["ada@example.com", "bob@example.com", "charlie@example.com"];

const validatedEmails = traverse(emails, validateEmail);
console.log("All valid emails:", validatedEmails);

const invalidEmails = ["ada@example.com", "invalid", "charlie@example.com"];

const validatedInvalidEmails = traverse(invalidEmails, validateEmail);
console.log("With invalid email:", validatedInvalidEmails);
