
-- 1. Add content length validation triggers for chat_messages
CREATE OR REPLACE FUNCTION public.validate_message_content()
RETURNS TRIGGER AS $$
BEGIN
  IF length(trim(NEW.content)) = 0 THEN
    RAISE EXCEPTION 'Message content cannot be empty';
  END IF;
  IF length(NEW.content) > 4000 THEN
    RAISE EXCEPTION 'Message content exceeds maximum length of 4000 characters';
  END IF;
  NEW.content := trim(NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_chat_message_content
  BEFORE INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_content();

CREATE TRIGGER validate_dm_content
  BEFORE INSERT OR UPDATE ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_message_content();

-- 2. Fix DM update policy: only receiver can mark as read
DROP POLICY IF EXISTS "Users can update own sent DMs" ON public.direct_messages;
CREATE POLICY "Receivers can mark messages as read"
  ON public.direct_messages FOR UPDATE
  USING (auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = receiver_id);

-- 3. Restrict activity_logs insert to only own activity with validated user_id
DROP POLICY IF EXISTS "Authenticated can insert activity" ON public.activity_logs;
CREATE POLICY "Users can insert own activity"
  ON public.activity_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());
