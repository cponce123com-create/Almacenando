import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: /click me/i })).toBeInTheDocument();
  });

  it("calls onClick handler", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button disabled onClick={() => { clicked = true; }}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(false);
  });

  it("renders with destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole("button").className).toContain("red");
  });
});
