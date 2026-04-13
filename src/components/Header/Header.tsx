export function Header() {
  return (
    <header className="px-8 pt-8 pb-5 max-w-[820px]">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[#1D1D1F] leading-[1.1] m-0">
          Corruption Map
        </h1>
        <a
          href="https://github.com/isabellereks/corruption-map"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] text-[#86868B] hover:text-[#1D1D1F] underline decoration-[#B5B5BA] underline-offset-2 transition-colors"
        >
          GitHub
        </a>
      </div>
      <p className="text-[13px] leading-[1.55] text-[#4A4A4F] mt-3 hidden sm:block">
        A visualization of every sitting member of the U.S. House and Senate
        and the money behind them. PAC contributions are pulled from the{' '}
        <a
          href="https://www.fec.gov/data/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[#B5B5BA] underline-offset-2 hover:text-[#1D1D1F] transition-colors"
        >
          FEC bulk data
        </a>{' '}
        and aggregated by industry using{' '}
        <a
          href="https://www.opensecrets.org/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[#B5B5BA] underline-offset-2 hover:text-[#1D1D1F] transition-colors"
        >
          OpenSecrets
        </a>{' '}
        classifications. Personal net-worth figures come from annual financial
        disclosures filed with the House and Senate ethics committees; flagged
        entries are those whose wealth in office has outgrown plausible salary
        income by more than 3×. Vote-alignment scores compare each lawmaker's
        roll-call record against positions held by their top five industry
        donors on a set of tracked bills — 100% means they voted with their
        donors every time, 0% means they never did.
      </p>
      <p className="text-[12px] leading-[1.55] text-[#86868B] mt-3 hidden sm:block">
        Caveat: donor alignment is a directional signal, not proof of
        corruption. A high score can reflect shared ideology as easily as it
        reflects influence, and absent bills (the ones that quietly die in
        committee) never show up in the data. Treat this as a starting point
        for questions, not a verdict. Data snapshot updates are logged in the
        repo.
      </p>
    </header>
  );
}
