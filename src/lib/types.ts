export type Person = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string;
  avatar_url: string | null;
  slack_user_id: string | null;
  created_at: string;
};

export type ThanksSource = "slack" | "web" | "seed";

export type Thanks = {
  id: string;
  from_person_id: string;
  to_person_id: string;
  reason: string;
  source: ThanksSource;
  created_at: string;
};

export type PersonSummary = Pick<Person, "id" | "name" | "avatar_url">;

export type ThanksWithPeople = Thanks & {
  from_person: PersonSummary;
  to_person: PersonSummary;
};

export type PersonWithStats = Person & {
  thanks_received: number;
  thanks_given: number;
};
