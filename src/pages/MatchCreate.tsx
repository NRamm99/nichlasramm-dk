import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { PlayerPicker, SetScores } from "../components/MatchFields";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page, PageStatus } from "../components/ui/Page";
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
import {
  listingCourts,
  listingOccupied,
  type MatchmakerListing,
  type MatchmakerRsvp,
} from "../lib/matchmaker";
import { fetchMembersByIds, fullName, type PartnerPreview } from "../lib/profile";
import {
  fetchPlayerRatingsByIds,
  ratingValues,
  withRating,
} from "../lib/rating";
import { supabase } from "../lib/supabase";

type Kind = "played" | "scheduled";

export function MatchCreate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fixtureId = searchParams.get("liga");
  const listingId = searchParams.get("annonce");
  const listingCourt = Number(searchParams.get("bane") || "1");
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
  const [listingLocked, setListingLocked] = useState(false);
  const [listingHostPlays, setListingHostPlays] = useState(true);
  const [listingCourtPlayers, setListingCourtPlayers] = useState<string[]>([]);
  const [format, setFormat] = useState<"singles" | "doubles">("doubles");
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());

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
    ]).then(async ([list, me]) => {
      const rows = (list.data ?? []) as PartnerPreview[];
      setMembers(rows.filter((row) => row.id !== user.id));
      const currentPartner = me.data?.partner_id ?? null;
      setClubPartnerId(currentPartner);
      if (currentPartner) {
        setPartner({ kind: "member", id: currentPartner });
      }
      const ratingRows = await fetchPlayerRatingsByIds(
        rows.map((row) => row.id),
      ).catch(() => new Map());
      setRatings(ratingValues(ratingRows));
    });
  }, [user]);

  useEffect(() => {
    if (!user || !listingId) return;
    void (async () => {
      const { data: listingRow } = await supabase
        .from("matchmaker_listings")
        .select("*")
        .eq("id", listingId)
        .maybeSingle();
      if (!listingRow) {
        setError("Annoncen findes ikke.");
        return;
      }
      const listing = listingRow as MatchmakerListing;
      if (listing.host_id !== user.id) {
        setError("Kun værten kan oprette kampen.");
        return;
      }
      const { data: rsvpRows } = await supabase
        .from("matchmaker_rsvps")
        .select("*")
        .eq("listing_id", listingId);
      const rsvps = (rsvpRows ?? []) as MatchmakerRsvp[];
      const courts = listingCourts(listing, rsvps);
      const court = courts[listingCourt - 1] ?? [];
      if (
        !Number.isInteger(listingCourt) ||
        listingCourt < 1 ||
        listingOccupied(listing, rsvps) < 4 ||
        court.length !== 4
      ) {
        setError(danishAuthError("LISTING_NOT_FULL"));
        return;
      }
      const hostPlays = court.includes(user.id);
      const others = court.filter((id) => id !== user.id);
      const partnerId = hostPlays
        ? (listing.brought_partner_id && court.includes(listing.brought_partner_id)
            ? listing.brought_partner_id
            : others[0])
        : court[1];
      const rest = hostPlays
        ? others.filter((id) => id !== partnerId)
        : [court[2], court[3]];
      setKind("scheduled");
      setWhen(toDatetimeLocalValue(new Date(listing.starts_at)));
      setListingHostPlays(hostPlays);
      setListingCourtPlayers(court);
      if (hostPlays) {
        setPartner({ kind: "member", id: partnerId });
        setOpponent1({ kind: "member", id: rest[0] });
        setOpponent2({ kind: "member", id: rest[1] });
      } else {
        setPartner({ kind: "member", id: court[1] });
        setOpponent1({ kind: "member", id: court[2] });
        setOpponent2({ kind: "member", id: court[3] });
      }
      setListingLocked(true);
    })();
  }, [listingCourt, listingId, user]);

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
        <PageStatus>Indlæser…</PageStatus>
      </SiteShell>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userId = user.id;

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
    if (!fixtureId && !listingId) {
      if (!opp1Json || (format === "doubles" && (!partnerJson || !opp2Json))) {
        setError(
          format === "singles"
            ? "Vælg en modstander — medlem eller gæst."
            : "Vælg partner og begge modstandere — medlem eller gæst.",
        );
        return;
      }
    }
    if (listingId && listingCourtPlayers.length !== 4) {
      setError(danishAuthError("LISTING_NOT_FULL"));
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

    const listingPlayers = listingId
      ? listingHostPlays
        ? [
            userId,
            partner?.kind === "member" ? partner.id : null,
            opponent1?.kind === "member" ? opponent1.id : null,
            opponent2?.kind === "member" ? opponent2.id : null,
          ]
        : listingCourtPlayers
      : null;
    if (
      listingId &&
      (!listingPlayers ||
        listingPlayers.some((id) => !id) ||
        listingPlayers.length !== 4)
    ) {
      setError(danishAuthError("PLAYER_REQUIRED"));
      return;
    }

    setSaving(true);
    const { data, error: createError } = fixtureId
      ? await supabase.rpc("create_league_match", {
          p_fixture_id: fixtureId,
          p_status: kind,
          p_played_at: playedAt,
          p_sets: setPayload,
        })
      : listingId
        ? await supabase.rpc("create_matchmaker_court_match", {
            p_listing_id: listingId,
            p_court: listingCourt,
            p_played_at: playedAt,
            p_players: listingPlayers as string[],
          })
      : await supabase.rpc("create_match", {
          p_status: kind,
          p_played_at: playedAt,
          p_partner: format === "singles" ? null : partnerJson,
          p_opponent1: opp1Json,
          p_opponent2: format === "singles" ? null : opp2Json,
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
      <Page>
        <BackLink
          to={fixtureId ? "/liga" : listingId ? `/matchmaker/${listingId}` : "/kampe"}
        >
          {fixtureId ? "Liga" : listingId ? "Annonce" : "Kampe"}
        </BackLink>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-ball">
          {fixtureId ? "Liga" : listingId ? "Find kamp" : "Kampe"}
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-wide sm:text-5xl lg:text-4xl">
          {fixtureId ? "Ny ligakamp" : listingId ? `Kamp på bane ${listingCourt}` : "Ny kamp"}
        </h1>

        {error && !kind ? (
          <p className="mt-6 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        {!kind ? (
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setKind("played");
                setWhen(
                  toDatetimeLocalValue(new Date(Date.now() - 60 * 60 * 1000)),
                );
              }}
              className="rounded-[var(--radius-card)] border border-line/10 bg-court-mid px-6 py-8 text-left transition hover:border-ball/40"
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
              className="rounded-[var(--radius-card)] border border-line/10 bg-court-mid px-6 py-8 text-left transition hover:border-ball/40"
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
            className="mt-8 max-w-2xl space-y-6 rounded-[var(--radius-card)] border border-line/10 bg-court-mid p-6"
          >
            <p className="text-sm text-line/70">
              {kind === "played" ? "Allerede spillet" : "Planlagt kamp"}
              {!listingLocked ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => setKind(null)}
                    className="font-semibold text-ball hover:underline"
                  >
                    Skift
                  </button>
                </>
              ) : (
                " · spillere fra annoncen"
              )}
            </p>

            {!fixtureId && !listingId ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                  Kampform
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormat("doubles");
                      if (
                        clubPartnerId &&
                        (partner === null || format === "singles")
                      ) {
                        setPartner({ kind: "member", id: clubPartnerId });
                      }
                    }}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      format === "doubles"
                        ? "bg-ball text-court"
                        : "border border-line/20 text-line/80"
                    }`}
                  >
                    Double
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormat("singles");
                      setPartner(null);
                      setOpponent2(null);
                    }}
                    className={`rounded-full px-4 py-2 text-xs font-semibold ${
                      format === "singles"
                        ? "bg-ball text-court"
                        : "border border-line/20 text-line/80"
                    }`}
                  >
                    Single
                  </button>
                </div>
              </div>
            ) : null}

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
                  {teamName(leagueHome, ratings) || "Jeres hold"}
                </p>
                <ul className="mt-1 text-line/70">
                  {leagueHome.map((player) => (
                    <li key={player.id}>
                      {withRating(fullName(player), ratings.get(player.id))}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-line/45">vs</p>
                <p className="mt-2 font-semibold">
                  {teamName(leagueAway, ratings) || "Modstandere"}
                </p>
                <ul className="mt-1 text-line/70">
                  {leagueAway.map((player) => (
                    <li key={player.id}>
                      {withRating(fullName(player), ratings.get(player.id))}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-line/50">
                  Spillere kan ikke ændres på en ligakamp.
                </p>
              </div>
            ) : listingLocked && listingHostPlays ? (
              <div className="rounded-2xl border border-line/10 bg-court px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                  Bane {listingCourt}
                </p>
                <p className="mt-2">Dig</p>
                <p className="text-line/70">
                  {partner?.kind === "member"
                    ? labeledMember(members, partner.id, ratings, "Makker")
                    : "Makker"}
                </p>
                <p className="mt-3 text-line/45">vs</p>
                <p className="text-line/70">
                  {opponent1?.kind === "member"
                    ? labeledMember(members, opponent1.id, ratings, "Modstander")
                    : "Modstander"}
                </p>
                <p className="text-line/70">
                  {opponent2?.kind === "member"
                    ? labeledMember(members, opponent2.id, ratings, "Modstander")
                    : "Modstander"}
                </p>
              </div>
            ) : listingLocked ? (
              <div className="rounded-2xl border border-line/10 bg-court px-4 py-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                  Bane {listingCourt} · du er ikke med
                </p>
                <p className="mt-2 text-line/70">
                  {labeledMember(
                    members,
                    listingCourtPlayers[0],
                    ratings,
                    "Spiller",
                  )}
                </p>
                <p className="text-line/70">
                  {labeledMember(
                    members,
                    listingCourtPlayers[1],
                    ratings,
                    "Spiller",
                  )}
                </p>
                <p className="mt-3 text-line/45">vs</p>
                <p className="text-line/70">
                  {labeledMember(
                    members,
                    listingCourtPlayers[2],
                    ratings,
                    "Spiller",
                  )}
                </p>
                <p className="text-line/70">
                  {labeledMember(
                    members,
                    listingCourtPlayers[3],
                    ratings,
                    "Spiller",
                  )}
                </p>
              </div>
            ) : (
              <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                {format === "singles" ? "Dig" : "Dit hold"}
              </p>
              {format === "doubles" ? (
                <p className="mt-2 text-sm text-line/80">Dig</p>
              ) : (
                <p className="mt-2 text-sm text-line/80">Du spiller single.</p>
              )}
              {format === "doubles" &&
              clubPartnerId &&
              partner?.kind === "member" &&
              partner.id === clubPartnerId ? (
                <p className="mt-1 text-xs text-line/50">
                  Din klubpartner er valgt. Du kan skifte, hvis I spillede i en
                  anden kombination.
                </p>
              ) : null}
              {format === "doubles" ? (
                <div className="mt-3">
                  <PlayerPicker
                    label="Partner"
                    members={members}
                    excludeIds={excludePartner}
                    ratings={ratings}
                    value={partner}
                    onChange={setPartner}
                  />
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-line/45">
                {format === "singles" ? "Modstander" : "Modstandere"}
              </p>
              <div className="mt-3 space-y-4">
                <PlayerPicker
                  label={format === "singles" ? "Modstander" : "Modstander 1"}
                  members={members}
                  excludeIds={excludeOpp1}
                  ratings={ratings}
                  value={opponent1}
                  onChange={setOpponent1}
                />
                {format === "doubles" ? (
                  <PlayerPicker
                    label="Modstander 2"
                    members={members}
                    excludeIds={excludeOpp2}
                    ratings={ratings}
                    value={opponent2}
                    onChange={setOpponent2}
                  />
                ) : null}
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
                    team1Label={format === "singles" ? "Dig" : "Dit hold"}
                    team2Label={
                      format === "singles" ? "Modstander" : "Modstandere"
                    }
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
      </Page>
    </SiteShell>
  );
}

function labeledMember(
  members: PartnerPreview[],
  id: string | undefined,
  ratings: Map<string, number>,
  fallback: string,
) {
  if (!id) return fallback;
  const member = members.find((row) => row.id === id);
  if (!member) return fallback;
  return withRating(fullName(member), ratings.get(id));
}
