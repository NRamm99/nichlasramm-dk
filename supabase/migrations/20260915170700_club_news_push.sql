create or replace function private.create_club_news(
  p_title text,
  p_body text,
  p_profile_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid;
  news_id uuid;
  cleaned_title text;
  cleaned_body text;
  n integer;
begin
  current_id := auth.uid();
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  cleaned_title := nullif(left(trim(coalesce(p_title, '')), 80), '');
  cleaned_body := left(trim(coalesce(p_body, '')), 800);
  if cleaned_title is null then
    raise exception 'NEWS_TITLE_REQUIRED';
  end if;
  if cleaned_body = '' then
    raise exception 'NEWS_BODY_REQUIRED';
  end if;

  if p_profile_ids is not null and coalesce(cardinality(p_profile_ids), 0) = 0 then
    raise exception 'NEWS_RECIPIENTS_REQUIRED';
  end if;

  insert into public.club_news (created_by, title, body)
  values (current_id, cleaned_title, cleaned_body)
  returning id into news_id;

  insert into public.club_news_targets (news_id, profile_id)
  select news_id, p.id
  from public.profiles p
  where p.banned_at is null
    and (p_profile_ids is null or p.id = any (p_profile_ids));

  get diagnostics n = row_count;
  if n = 0 then
    delete from public.club_news where id = news_id;
    raise exception 'NO_NEWS_RECIPIENTS';
  end if;

  insert into public.notifications (recipient_id, kind, payload)
  select
    t.profile_id,
    'club_news',
    jsonb_build_object(
      'href', '/',
      'news_id', news_id,
      'title', cleaned_title,
      'body', 'Åbn appen for at se'
    )
  from public.club_news_targets t
  where t.news_id = news_id;

  return news_id;
end;
$$;
