import { SettingsCard } from '@/settings/components/SettingsCard';
import { SettingsPageContainer } from '@/settings/components/SettingsPageContainer';
import { SettingsLabContent } from '@/settings/lab/components/SettingsLabContent';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { SettingsPageLayout } from '@/settings/components/layout/SettingsPageLayout';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { Section } from 'twenty-ui/components';
import { IconCode, IconWorld, type IconComponent } from 'twenty-ui/icon';
import { SettingsPath } from 'twenty-shared/types';
import { PermissionFlagType } from '~/generated-metadata/graphql';
import { getSettingsPath } from 'twenty-shared/utils';
import { PRODUCT_BRAND } from 'twenty-shared/constants';
import { MOBILE_VIEWPORT, themeCssVariables, useTheme } from 'twenty-ui/theme';

const StyledCardLink = styled.a`
  display: block;
  min-width: 0;
  text-decoration: none;
`;

const StyledCardsGrid = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    grid-template-columns: 1fr;
  }
`;

type SettingsCommunityLink = {
  href: string;
  Icon: IconComponent;
  cardTitle: string;
};

export const SettingsCommunity = () => {
  const theme = useTheme();
  // Lab toggles change workspace feature flags, unlike the rest of this page.
  const canManageWorkspace = useHasPermissionFlag(PermissionFlagType.WORKSPACE);

  const socialLinks: SettingsCommunityLink[] = [
    {
      href: PRODUCT_BRAND.websiteUrl,
      Icon: IconWorld,
      cardTitle: t`Nova CRM website`,
    },
    {
      href: PRODUCT_BRAND.sourceCodeUrl,
      Icon: IconCode,
      cardTitle: t`Source code`,
    },
  ];

  return (
    <SettingsPageLayout
      title={t`About Nova CRM`}
      links={[
        {
          children: t`Other`,
          href: getSettingsPath(SettingsPath.Community),
        },
        { children: t`About Nova CRM` },
      ]}
    >
      <SettingsPageContainer>
        <Section.Root>
          <Section.Header
            title={t`Nova CRM`}
            description={t`Open-source customer relationship management for your team.`}
          />
          <StyledCardsGrid>
            {socialLinks.map(({ href, Icon, cardTitle }) => (
              <StyledCardLink
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SettingsCard
                  Icon={
                    <Icon
                      size={theme.icon.size.md}
                      stroke={theme.icon.stroke.sm}
                    />
                  }
                  title={cardTitle}
                />
              </StyledCardLink>
            ))}
          </StyledCardsGrid>
        </Section.Root>

        {canManageWorkspace && (
          <Section.Root>
            <Section.Header
              title={t`Features`}
              description={t`Try our upcoming features. Note they are still in beta. Please bear with us and report any issues you find.`}
            />
            <SettingsLabContent />
          </Section.Root>
        )}
      </SettingsPageContainer>
    </SettingsPageLayout>
  );
};
