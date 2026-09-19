import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  MatchDraftCard,
  type DraftSlot,
} from "../components/MatchDraftCard";
import { PlayerSearchSheet } from "../components/PlayerSearchSheet";
import { SiteShell } from "../components/SiteShell";
import { BackLink, Page, PageStatus } from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { useAuth } from "../context/AuthContext";
import { danishAuthError } from "../lib/authErrors";
import type { LeagueTeamPlayer } from "../lib/league";
import {
  DEFAULT_MATCH_DURATION_MINUTES,
  fromDatetimeLocalValue,
  playerPickToJson,
  toDatetimeLocalValue,
  validateMatchSets,
  type MatchDurationMinutes,
  type PlayerPick,
} from "../lib/match";
import {
  listingCourts,
  listingOccupied,
  type MatchmakerListing,
  type MatchmakerRsvp,
} from "../lib/matchmaker";
import { fetchMembersByIds, type PartnerPreview } from "../lib/profile";
import { fetchPlayerRatingsByIds, ratingValues } from "../lib/rating";
import { supabase } from "../lib/supabase";

type Kind = "played" | "scheduled";
type Format = "singles" | "doubles";
type SlotKey = "partner" | "opp1" | "opp2";

const KIND_OPTIONS = [
  { id: "played", label: "Spillet" },
  { id: "scheduled", label: "Planlagt" },
] as const;

const FORMAT_OPTIONS = [
  { id: "doubles", label: "Double" },
  { id: "singles", label: "Single" },
] as const;

export function MatchCreate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fixtureId = searchParams.get("liga");
  const listingId = searchParams.get("annonce");
  const listingCourt = Number(searchParams.get("bane") || "1");
  const [kind, setKind] = useState<Kind>("played");
  const [self, setSelf] = useState<PartnerPreview | null>(null);
  const [members, setMembers] = useState<PartnerPreview[]>([]);
  const [clubPartnerId, setClubPartnerId] = useState<string | null>(null);
  const [when, setWhen] = useState(() => toDatetimeLocalValue(new Date()));
  const [durationMinutes, setDurationMinutes] = useState<MatchDurationMinutes>(
    DEFAULT_MATCH_DURATION_MINUTES,
  );
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
  const [format, setFormat] = useState<Format>("doubles");
  const [ratings, setRatings] = useState<Map<string, number>>(new Map());
  const [picking, setPicking] = useState<SlotKey | null>(null);

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
      setSelf(rows.find((row) => row.id === user.id) ?? {
        id: user.id,
        username: null,
        first_name: null,
        last_name: null,
        avatar_url: null,
      });
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
        ? listing.brought_partner_id && court.includes(listing.brought_partner_id)
          ? listing.brought_partner_id
          : others[0]
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

  const people = useMemo(() => {
    const map = new Map<string, PartnerPreview>();
    if (self) map.set(self.id, self);
    for (const member of members) map.set(member.id, member);
    for (const person of leagueHome) map.set(person.id, person);
    for (const person of leagueAway) map.set(person.id, person);
    return map;
  }, [leagueAway, leagueHome, members, self]);

  const { team1, team2 } = useMemo(
    () =>
      draftTeams({
        userId: user?.id,
        format,
        partner,
        opponent1,
        opponent2,
        fixtureId,
        leagueHome,
        leagueAway,
        listingLocked,
        listingHostPlays,
        listingCourtPlayers,
      }),
    [
      fixtureId,
      format,
      leagueAway,
      leagueHome,
      listingCourtPlayers,
      listingHostPlays,
      listingLocked,
      opponent1,
      opponent2,
      partner,
      user?.id,
    ],
  );

  const pickingSlot = picking
    ? [...team1, ...team2].find((slot) => slot.key === picking) ?? null
    : null;

  const excludeIds = useMemo(() => {
    const ids = [
      user?.id,
      partner?.kind === "member" ? partner.id : null,
      opponent1?.kind === "member" ? opponent1.id : null,
      opponent2?.kind === "member" ? opponent2.id : null,
    ];
    return ids.filter((id): id is string => Boolean(id));
  }, [opponent1, opponent2, partner, user?.id]);

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
  const blocked =
    Boolean(listingId && !listingLocked) || Boolean(fixtureId && !leagueReady);
  const partnerHint =
    !fixtureId &&
    !listingId &&
    format === "doubles" &&
    clubPartnerId &&
    partner?.kind === "member" &&
    partner.id === clubPartnerId
      ? "Din klubpartner er valgt. Tryk for at skifte, hvis I spillede i en anden kombination."
      : null;

  function changeKind(next: Kind) {
    setKind(next);
    const playedAt = fromDatetimeLocalValue(when);
    if (!playedAt) return;
    const now = Date.now();
    const t = new Date(playedAt).getTime();
    if (next === "played" && t > now + 15 * 60 * 1000) {
      setWhen(toDatetimeLocalValue(new Date()));
    }
    if (next === "scheduled" && t < now - 15 * 60 * 1000) {
      setWhen(toDatetimeLocalValue(new Date(now + 24 * 60 * 60 * 1000)));
    }
  }

  function changeFormat(next: Format) {
    setFormat(next);
    if (next === "doubles") {
      if (clubPartnerId && (partner === null || format === "singles")) {
        setPartner({ kind: "member", id: clubPartnerId });
      }
      return;
    }
    setPartner(null);
    setOpponent2(null);
  }

  function setSlotPick(key: SlotKey, pick: PlayerPick | null) {
    if (key === "partner") setPartner(pick);
    else if (key === "opp1") setOpponent1(pick);
    else setOpponent2(pick);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          ...(kind === "scheduled"
            ? { p_duration_minutes: durationMinutes }
            : {}),
        })
      : listingId
        ? await supabase.rpc("create_matchmaker_court_match", {
            p_listing_id: listingId,
            p_court: listingCourt,
            p_played_at: playedAt,
            p_players: listingPlayers as string[],
            p_duration_minutes: durationMinutes,
          })
        : await supabase.rpc("create_match", {
            p_status: kind,
            p_played_at: playedAt,
            p_partner: format === "singles" ? null : partnerJson,
            p_opponent1: opp1Json,
            p_opponent2: format === "singles" ? null : opp2Json,
            p_sets: setPayload,
            ...(kind === "scheduled"
              ? { p_duration_minutes: durationMinutes }
              : {}),
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
          {fixtureId
            ? "Ny ligakamp"
            : listingId
              ? `Kamp på bane ${listingCourt}`
              : "Ny kamp"}
        </h1>

        {blocked ? (
          error ? (
            <p className="mt-6 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : (
            <p className="mt-6 text-sm text-line/60">Indlæser…</p>
          )
        ) : (
          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="mt-6 space-y-5"
          >
            <div className="flex flex-wrap gap-2">
              {!listingLocked ? (
                <SegmentedControl
                  label="Kampens type"
                  value={kind}
                  onChange={changeKind}
                  options={KIND_OPTIONS}
                />
              ) : null}
              {!fixtureId && !listingId ? (
                <SegmentedControl
                  label="Kampform"
                  value={format}
                  onChange={changeFormat}
                  options={FORMAT_OPTIONS}
                />
              ) : null}
            </div>

            <MatchDraftCard
              kind={kind}
              when={when}
              onWhenChange={setWhen}
              durationMinutes={durationMinutes}
              onDurationChange={setDurationMinutes}
              team1={team1}
              team2={team2}
              people={people}
              ratings={ratings}
              sets={sets}
              onSetsChange={setSets}
              onSlotClick={(slot) => {
                if (slot.locked) return;
                if (
                  slot.key === "partner" ||
                  slot.key === "opp1" ||
                  slot.key === "opp2"
                ) {
                  setPicking(slot.key);
                }
              }}
              hint={partnerHint}
            />

            {error ? (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              block
              disabled={saving || Boolean(fixtureId && !leagueReady)}
            >
              {saving ? "Opretter…" : "Opret kamp"}
            </Button>
          </form>
        )}

        <PlayerSearchSheet
          open={Boolean(picking)}
          onClose={() => setPicking(null)}
          title={pickingSlot ? `Vælg ${pickingSlot.label.toLowerCase()}` : "Vælg spiller"}
          members={members}
          excludeIds={excludeIds}
          ratings={ratings}
          allowGuest
          value={pickingSlot?.pick ?? null}
          onSelect={(pick) => {
            if (picking) setSlotPick(picking, pick);
          }}
        />
      </Page>
    </SiteShell>
  );
}

function memberSlot(
  key: string,
  id: string | undefined,
  label: string,
  youId?: string,
): DraftSlot {
  return {
    key,
    pick: id ? { kind: "member", id } : null,
    locked: true,
    you: Boolean(id && youId && id === youId),
    label,
  };
}

function draftTeams({
  userId,
  format,
  partner,
  opponent1,
  opponent2,
  fixtureId,
  leagueHome,
  leagueAway,
  listingLocked,
  listingHostPlays,
  listingCourtPlayers,
}: {
  userId?: string;
  format: Format;
  partner: PlayerPick | null;
  opponent1: PlayerPick | null;
  opponent2: PlayerPick | null;
  fixtureId: string | null;
  leagueHome: PartnerPreview[];
  leagueAway: PartnerPreview[];
  listingLocked: boolean;
  listingHostPlays: boolean;
  listingCourtPlayers: string[];
}): { team1: DraftSlot[]; team2: DraftSlot[] } {
  if (fixtureId) {
    return {
      team1: leagueHome.map((person, index) =>
        memberSlot(`home-${person.id}`, person.id, `Hold 1 · ${index + 1}`, userId),
      ),
      team2: leagueAway.map((person, index) =>
        memberSlot(`away-${person.id}`, person.id, `Hold 2 · ${index + 1}`, userId),
      ),
    };
  }

  if (listingLocked && !listingHostPlays) {
    return {
      team1: [
        memberSlot("court-0", listingCourtPlayers[0], "Spiller", userId),
        memberSlot("court-1", listingCourtPlayers[1], "Spiller", userId),
      ],
      team2: [
        memberSlot("court-2", listingCourtPlayers[2], "Spiller", userId),
        memberSlot("court-3", listingCourtPlayers[3], "Spiller", userId),
      ],
    };
  }

  const locked = listingLocked;
  const team1: DraftSlot[] = [
    {
      key: "self",
      pick: userId ? { kind: "member", id: userId } : null,
      locked: true,
      you: true,
      label: "Dig",
    },
  ];
  if (format === "doubles" || listingLocked) {
    team1.push({
      key: "partner",
      pick: partner,
      locked,
      label: "Partner",
    });
  }
  const team2: DraftSlot[] = [
    {
      key: "opp1",
      pick: opponent1,
      locked,
      label: format === "singles" && !listingLocked ? "Modstander" : "Modstander 1",
    },
  ];
  if (format === "doubles" || listingLocked) {
    team2.push({
      key: "opp2",
      pick: opponent2,
      locked,
      label: "Modstander 2",
    });
  }
  return { team1, team2 };
}
