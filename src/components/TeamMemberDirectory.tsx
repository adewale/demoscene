import type { TeamMember } from "../config/repositories";
import { githubAvatarUrl } from "../lib/github/avatar";

export type TeamMemberOverview = TeamMember;

function TeamMemberRow({ member }: { member: TeamMemberOverview }) {
  return (
    <li className="team-directory-item" data-team-member-login={member.login}>
      <a
        className="team-card-link"
        href={`https://github.com/${member.login}`}
        rel="noreferrer"
        target="_blank"
      >
        <img
          alt={`${member.name} avatar`}
          className="team-card-avatar"
          decoding="async"
          height="24"
          loading="lazy"
          src={githubAvatarUrl(member.login, 72)}
          width="24"
        />
        <div className="team-card-copy">
          <div className="team-card-heading-row">
            <strong className="team-card-name">{member.name}</strong>
            <span className="team-card-login">@{member.login}</span>
          </div>
        </div>
      </a>
    </li>
  );
}

function TeamMemberCards({
  label,
  members,
  title,
}: {
  label: string;
  members: TeamMemberOverview[];
  title?: string;
}) {
  return (
    <section aria-label={label} className="card team-directory-panel">
      <div className="card-body team-directory-panel-body">
        {title ? <p className="team-directory-heading">{title}</p> : null}
        <ul className="team-directory-list">
          {members.map((member) => (
            <TeamMemberRow key={member.login} member={member} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TeamMemberRail({ members }: { members: TeamMemberOverview[] }) {
  return (
    <aside aria-label="Team directory" className="team-rail">
      <TeamMemberCards
        label="Team members"
        members={members}
        title="Cloudflare DevRel"
      />
    </aside>
  );
}

export function TeamMemberMenu({ members }: { members: TeamMemberOverview[] }) {
  return (
    <details className="team-menu">
      <summary className="button-base button-secondary team-menu-trigger">
        <span aria-hidden="true" className="team-menu-icon">
          |||
        </span>
        <span>Team members</span>
      </summary>
      <div className="team-menu-panel">
        <TeamMemberCards label="Team members menu" members={members} />
      </div>
    </details>
  );
}
