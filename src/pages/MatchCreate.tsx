import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { PlayerPicker, SetScores } from "../components/MatchFields";
import { SiteShell } from "../components/SiteShell";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import { teamName, type LeagueTeamPlayer } from "../lib/league";
import {
  fromDatetimeLocalValue,
  playerPickToJson,
  toDatetimeLocalValue,
  validateMatchSets,
  type PlayerPick,
} from "../lib/match";
import { fetchMembersByIds, fullName, type PartnerPreview } from "../lib/profile";
import { supabase } from "../lib/supabase";

type Kind = "played" | "scheduled";

export function MatchCreate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fixtureId = searchParams.get("liga");
  const [kind, setKind] = useState<Kind | null>(null);
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [clubPartnerId, setClubPartnerId] = useState<string | null>(null);
  const [when, setWhen] = useState(() => toDatetimeLocalValue(new Date()));
  const [partner, setPartner] = useState<PlayerPick | null>(null);
  const [opponent1, setOpponent1] = useState<PlayerPick | null>(null);
  const [opponent2, setOpponent2] = useState<PlayerPick | null>(null);
  const [sets, setSets] = useState([{ team1: "", team2: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leagueHome, setLeagueHome] = useState<PartnerPreview[]>([]);
  const [leagueAway, setLeagueAway] = useState<PartnerPreview[]>([]);
  const [leagueReady, setLeagueReady] = useState(false);

  useEffect(() => {
    if (!user) return;
    void Promise.all([
      supabase
        .from("profiles")
        .select("id, username, first_name, last_name, avatar_url")
        .is("banned_at", null)
        .order("first_name"),
      supabase
        .from("profiles")
        .select("partner_id")
        .eq("id", user.id)
        .maybeSingle(),
    ]).then(([list, me]) => {
      const rows = (list.data ?? []) as PartnerPreview[];
      setMembers(rows.filter((row) => row.id !== user.id));
      const currentPartner = me.data?.partner_id ?? null;
      setClubPartnerId(currentPartner);
      if (currentPartner) {
        setPartner({ kind: "member", id: currentPartner });
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user || !fixtureId) return;
    void (async () => {
      const { data: fixture } = await supabase
        .from("league_fixtures")
        .select("id, team_a_id, team_b_id, match_id")
        .eq("id", fixtureId)
        .maybeSingle();
      if (!fixture) {
        setError("Ligakampen findes ikke.");
        return;
      }
      if (fixture.match_id) {
        setError("Der er allerede registreret en ligakamp mod holdet.");
        return;
      }
      const { data: roster } = await supabase
        .from("league_team_players")
        .select("*")
        .in("team_id", [fixture.team_a_id, fixture.team_b_id]);
      const rows = (roster ?? []) as LeagueTeamPlayer[];
      const people = await fetchMembersByIds(rows.map((row) => row.profile_id));
      const myTeamId = rows.find((row) => row.profile_id === user.id)?.team_id;
      if (!myTeamId) {
        setError("Du er ikke med i den ligakamp.");
        return;
      }
      const oppTeamId =
        myTeamId === fixture.team_a_id ? fixture.team_b_id : fixture.team_a_id;
      const home = rows
        .filter((row) => row.team_id === myTeamId)
        .sort((a, b) => a.slot - b.slot)
        .map((row) => people.get(row.profile_id))
        .filter((person): person is PartnerPreview => Boolean(person));
      const away = rows
        .filter((row) => row.team_id === oppTeamId)
        .sort((a, b) => a.slot - b.slot)
        .map((row) => people.get(row.profile_id))
        .filter((person): person is PartnerPreview => Boolean(person));
      setLeagueHome(home);
      setLeagueAway(away);
      setLeagueReady(true);
    })();
  }, [fixtureId, user]);

  const excludePartner = useMemo(() => {
    const ids = [
      user?.id,
      opponent1?.kind === "member" ? opponent1.id : null,
      opponent2?.kind === "member" ? opponent2.id : null,
    ];
    return ids.filter((id): id is string => Boolean(id));
  }, [opponent1, opponent2, user?.id]);

  const excludeOpp1 = useMemo(() => {
    const ids = [
      user?.id,
      partner?.kind === "member" ? partner.id : null,
      opponent2?.kind === "member" ? opponent2.id : null,
    ];
    return ids.filter((id): id is string => Boolean(id));
  }, [opponent2, partner, user?.id]);

  const excludeOpp2 = useMemo(() => {
    const ids = [
      user?.id,
      partner?.kind === "member" ? partner.id : null,
      opponent1?.kind === "member" ? opponent1.id : null,
    ];
    return ids.filter((id): id is string => Boolean(id));
  }, [opponent1, partner, user?.id]);

  if (loading) {
    return (
      <SiteShell>
        <main className="flex min-h-[calc(100vh-5.5rem)] items-center justify-center px-6 text-sm text-line/60">
          Indlæser…
        </main>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    setError(null);

    const playedAt = fromDatetimeLocalValue(when);
    if (!playedAt) {
      setError("Vælg dato og tid.");
      return;
    }

    const partnerJson = playerPickToJson(partner);
    const opp1Json = playerPickToJson(opponent1);
    const opp2Json = playerPickToJson(opponent2);
    if (fixtureId && !leagueReady) {
      setError("Ligakampen kunne ikke indlæses.");
      return;
    }
    if (!fixtureId && (!partnerJson || !opp1Json || !opp2Json)) {
      setError("Vælg partner og begge modstandere — medlem eller gæst.");
      return;
    }

    let setPayload: Array<{ team1: number; team2: number }> | null = null;
    if (kind === "played") {
      const parsed = sets.map((row) => ({
        team1: Number(row.team1),
        team2: Number(row.team2),
      }));
      const setErrorCode = validateMatchSets(parsed);
      if (setErrorCode) {
        setError(danishAuthError(setErrorCode));
        return;
      }
      setPayload = parsed;
    }

    setSaving(true);
    const { data, error: createError } = fixtureId
      ? await supabase.rpc("create_league_match", {
          p_fixture_id: fixtureId,
          p_status: kind,
          p_played_at: playedAt,
          p_sets: setPayload,
        })
      : await supabase.rpc("create_match", {
          p_status: kind,
          p_played_at: playedAt,
          p_partner: partnerJson,
          p_opponent1: opp1Json,
          p_opponent2: opp2Json,
          p_sets: setPayload,
        });
    setSaving(false);

    if (createError) {
      setError(danishAuthError(createError.message));
      return;
    }

    navigate(`/kampe/${data}`, { replace: true });
  }

  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[calc(100vh-5.5rem)] w-full max-w-xl flex-col px-6 pb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          {fixtureId ? "Liga" : "Kampe"}
        </p>
        <h1 className="mt-2 font-display text-6xl tracking-wide">
          {fixtureId ? "Ny ligakamp" : "Ny kamp"}
        </h1>
        <Link
          to={fixtureId ? "/liga" : "/kampe"}
          className="mt-2 text-sm font-semibold text-ball"
        >
          {fixtureId ? "Tilbage til liga" : "Tilbage til kampe"}
        </Link>

        {!kind ? (
          <div className="mt-10 grid gap-4">
            <button
              type="button"
              onClick={() => {
                setKind("played");
                setWhen(
                  toDatetimeLocalValue(new Date(Date.now() - 60 * 60 * 1000)),
                );
              }}
              className="rounded-3xl border border-line/10 bg-court-mid/80 px-6 py-8 text-left transition hover:border-ball/40"
            >
              <p className="font-display text-3xl tracking-wide">
                Allerede spillet
              </p>
              <p className="mt-2 text-sm text-line/65">
                Resultatet skal registreres med det samme.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setKind("scheduled");
                setWhen(
                  toDatetimeLocalValue(
                    new Date(Date.now() + 24 * 60 * 60 * 1000),
                  ),
                );
              }}
              className="rounded-3xl border border-line/10 bg-court-mid/80 px-6 py-8 text-left transition hover:border-ball/40"
            >
              <p className="font-display text-3xl tracking-wide">Planlagt kamp</p>
              <p className="mt-2 text-sm text-line/65">
                Tid, spillere og kommentarer. Resultat kan tilføjes senere.
              </p>
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-8 space-y-6 rounded-3xl border border-line/10 bg-court-mid/80 p-6"
          >
            <p className="text-sm text-line/70">
              {kind === "played" ? "Allerede spillet" : "Planlagt kamp"}
              {" · "}
              <button
                type="button"
                onClick={() => setKind(null)}
                className="font-semibold text-ball hover:underline"
              >
                Skift
              </button>
            </p>

            <label className="block text-sm font-medium text-line/80">
              Dato og tid
              <input
                type="datetime-local"
                required
                value={when}
                onChange={(event) => setWhen(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-line/15 bg-court px-4 py-3 outline-none focus:border-ball"
              />
            </label>

            {fixtureId ? (
              <div className="rounded-2xl border border-line/10 bg-court px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                  Holdene er låst
                </p>
                <p className="mt-2 font-semibold">
                  {teamName(leagueHome) || "Jeres hold"}
                </p>
                <ul className="mt-1 text-line/70">
                  {leagueHome.map((player) => (
                    <li key={player.id}>{fullName(player)}</li>
                  ))}
                </ul>
                <p className="mt-3 text-line/45">vs</p>
                <p className="mt-2 font-semibold">
                  {teamName(leagueAway) || "Modstandere"}
                </p>
                <ul className="mt-1 text-line/70">
                  {leagueAway.map((player) => (
                    <li key={player.id}>{fullName(player)}</li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-line/50">
                  Spillere kan ikke ændres på en ligakamp.
                </p>
              </div>
            ) : (
              <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                Dit hold
              </p>
              <p className="mt-2 text-sm text-line/80">Dig</p>
              {clubPartnerId &&
              partner?.kind === "member" &&
              partner.id === clubPartnerId ? (
                <p className="mt-1 text-xs text-line/50">
                  Din klubpartner er valgt. Du kan skifte, hvis I spillede i en
                  anden kombination.
                </p>
              ) : null}
              <div className="mt-3">
                <PlayerPicker
                  label="Partner"
                  members={members}
                  excludeIds={excludePartner}
                  value={partner}
                  onChange={setPartner}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                Modstandere
              </p>
              <div className="mt-3 space-y-4">
                <PlayerPicker
                  label="Modstander 1"
                  members={members}
                  excludeIds={excludeOpp1}
                  value={opponent1}
                  onChange={setOpponent1}
                />
                <PlayerPicker
                  label="Modstander 2"
                  members={members}
                  excludeIds={excludeOpp2}
                  value={opponent2}
                  onChange={setOpponent2}
                />
              </div>
            </div>
              </>
            )}

            {kind === "played" ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                  Resultat
                </p>
                <div className="mt-3">
                  <SetScores
                    sets={sets}
                    onChange={setSets}
                    team1Label="Dit hold"
                    team2Label="Modstandere"
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={saving || Boolean(fixtureId && !leagueReady)}
              className="w-full rounded-full bg-ball py-3 text-sm font-semibold text-court disabled:opacity-60"
            >
              {saving ? "Opretter…" : "Opret kamp"}
            </button>
          </form>
        )}
      </main>
    </SiteShell>
  );
}
