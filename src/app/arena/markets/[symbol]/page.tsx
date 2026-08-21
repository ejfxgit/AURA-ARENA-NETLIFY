// Arena-scoped market detail.
//
// The same market-detail view as /markets/[symbol], mounted inside the arena so
// clicking a market from the arena's Markets view keeps the arena sidebar shell
// instead of dropping the user onto the public landing layout (AppShell chooses
// the shell purely from the "/arena" path prefix).
//
// The component is shared rather than duplicated: route behaviour, data flow and
// design stay identical, and its back link follows whichever route mounted it.

export { default } from "@/app/markets/[symbol]/page";
