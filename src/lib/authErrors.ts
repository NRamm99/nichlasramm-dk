const messages: Record<string, string> = {
  "Invalid login credentials": "Forkert brugernavn eller adgangskode.",
  "User already registered": "Brugernavnet er optaget.",
  "Database error saving new user":
    "Kontoen kunne ikke oprettes. Prøv et andet brugernavn, eller opret koden igen.",
  "Database error granting user":
    "Kontoen kunne ikke oprettes. Prøv igen.",
  INVITE_REQUIRED: "Du skal bruge en invitationskode for at oprette en konto.",
  INVITE_INVALID: "Invitationskoden er ugyldig eller allerede brugt.",
  NAME_REQUIRED: "Fornavn og efternavn er påkrævet.",
  USERNAME_INVALID:
    "Brugernavn skal være 3–24 tegn og kun indeholde bogstaver, tal, punktum, bindestreg eller understreg.",
  USERNAME_TAKEN: "Brugernavnet er optaget.",
  NOT_ADMIN: "Kun administratoren kan gøre det.",
  CANNOT_BAN_SELF: "Du kan ikke spærre din egen konto.",
  CANNOT_BAN_ADMIN: "En administrator kan ikke spærres.",
  "User is banned": "Denne konto er spærret.",
  NOT_AUTHENTICATED: "Du skal være logget ind.",
  CANNOT_PARTNER_SELF: "Du kan ikke være partner med dig selv.",
  HAS_PARTNER: "Du har allerede en partner.",
  TARGET_HAS_PARTNER: "Den spiller har allerede en partner.",
  MEMBER_NOT_FOUND: "Medlemmet findes ikke.",
  ALREADY_REQUESTED: "Du har allerede sendt en anmodning.",
  REQUEST_NOT_FOUND: "Anmodningen findes ikke længere.",
  NOT_RECIPIENT: "Du kan ikke svare på den anmodning.",
  MATCH_SETS_REQUIRED: "Et spillet resultat skal have mindst ét sæt.",
  TOO_MANY_SETS: "Der kan højst registreres 5 sæt.",
  UNFINISHED_SET_NOT_LAST: "Kun det sidste sæt kan være ufærdigt.",
  INVALID_SET: "Partier skal være et tal mellem 0 og 7.",
  PLAYER_REQUIRED: "Alle fire spillere skal udfyldes.",
  DUPLICATE_PLAYER: "Samme spiller kan ikke stå flere gange i kampen.",
  NOT_MATCH_PLAYER: "Kun spillere i kampen kan gøre det.",
  CANNOT_DELETE_MATCH: "Kun spillere i kampen eller en administrator kan slette den.",
  MATCH_NOT_FOUND: "Kampen findes ikke.",
  INVALID_WHEN: "Dato og tid passer ikke til kampens type.",
  INVALID_STATUS: "Vælg om kampen er spillet eller planlagt.",
  COMMENT_REQUIRED: "Skriv en kommentar.",
  RESULT_ALREADY_SET: "Kampen har allerede et resultat.",
  FUTURE_MATCH_NO_RESULT: "En planlagt kamp kan ikke have resultat endnu.",
  LEAGUE_DATES_REQUIRED: "Udfyld start, slut og tilmeldelsesfrist.",
  LEAGUE_DATES_INVALID: "Slutdato skal være efter startdato.",
  LEAGUE_NOT_FOUND: "Ligaen findes ikke.",
  SIGNUP_CLOSED: "Tilmeldingsfristen er overskredet.",
  LEAGUE_PARTNER_REQUIRED: "Vælg en makker til ligaen.",
  ALREADY_IN_LEAGUE: "Du er allerede tilmeldt ligaen.",
  PARTNER_IN_LEAGUE: "Den spiller er allerede tilmeldt et andet hold.",
  FIXTURE_NOT_FOUND: "Kampen i ligaen findes ikke.",
  NOT_FIXTURE_PLAYER: "Du er ikke med i den ligakamp.",
  LEAGUE_MATCH_ALREADY_SET: "Der er allerede registreret en ligakamp mod holdet.",
};

export function danishAuthError(message: string | null | undefined): string {
  if (!message) {
    return "Noget gik galt. Prøv igen.";
  }

  const exact = messages[message];
  if (exact) {
    return exact;
  }

  const matched = Object.entries(messages)
    .filter(([code]) => message.includes(code))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (matched) {
    return matched[1];
  }

  return message;
}

export function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase().replaceAll(/\s+/g, "");
}
