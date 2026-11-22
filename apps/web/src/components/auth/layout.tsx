import type { ReactNode } from "react";
import { AccountEntryFrame } from "../account-entry-frame";
import "./layout.css";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <AccountEntryFrame>
      <div className="grid flex-1 content-start items-center gap-8 py-8 sm:py-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,1fr)] lg:content-center lg:gap-8 lg:py-14 xl:gap-12">
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-[35.5rem] wrap-anywhere lg:px-3"
        >
          {children}
        </main>
        <div aria-hidden="true" className="auth-illustration rounded-card" />
      </div>
    </AccountEntryFrame>
  );
}
