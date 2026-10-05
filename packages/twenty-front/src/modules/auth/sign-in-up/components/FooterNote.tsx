import { styled } from '@linaria/react';
import { Trans } from '@lingui/react/macro';
import { Fragment } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { useWorkspaceBypass } from '@/auth/sign-in-up/hooks/useWorkspaceBypass';
import { getTwentyWebsiteUrl } from '@/auth/utils/getTwentyWebsiteUrl';
import { useIsCurrentLocationOnAWorkspace } from '@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace';
import { ONBOARDING_CONTENT_BLOCK_WIDTH } from '@/onboarding/constants/OnboardingContentBlockWidth';
import { themeCssVariables } from 'twenty-ui/theme';

const StyledCopyContainer = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.4;
  max-width: ${ONBOARDING_CONTENT_BLOCK_WIDTH}px;
  text-align: center;

  & > a {
    color: ${themeCssVariables.font.color.tertiary};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const StyledLinksContainer = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: nowrap;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  justify-content: center;
  max-width: 100%;
  text-align: center;
  white-space: nowrap;

  & > a,
  & > button {
    background: none;
    border: none;
    color: ${themeCssVariables.font.color.tertiary};
    cursor: pointer;
    font: inherit;
    padding: 0;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const StyledSeparator = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

type FooterNoteProps = {
  secondaryAgreement?: 'privacyPolicy' | 'dataProcessingAgreement';
};

export const FooterNote = ({
  secondaryAgreement = 'privacyPolicy',
}: FooterNoteProps) => {
  const { isOnAWorkspace } = useIsCurrentLocationOnAWorkspace();
  const { shouldOfferBypass, shouldUseBypass, enableBypass } =
    useWorkspaceBypass();

  const termsUrl = getTwentyWebsiteUrl('terms');
  const secondaryAgreementUrl = getTwentyWebsiteUrl(
    secondaryAgreement === 'dataProcessingAgreement'
      ? 'data-processing-agreement'
      : 'privacy-policy',
  );
  const privacyPolicyUrl = getTwentyWebsiteUrl('privacy-policy');

  if (!isOnAWorkspace) {
    if (!isDefined(termsUrl) || !isDefined(secondaryAgreementUrl)) {
      return null;
    }

    return (
      <StyledCopyContainer>
        <Trans>By using Nova CRM, you agree to the</Trans>{' '}
        <a href={termsUrl} target="_blank" rel="noopener noreferrer">
          <Trans>Terms of Service</Trans>
        </a>{' '}
        <Trans>and</Trans>{' '}
        <a
          href={secondaryAgreementUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {secondaryAgreement === 'dataProcessingAgreement' ? (
            <Trans>Data Processing Agreement</Trans>
          ) : (
            <Trans>Privacy Policy</Trans>
          )}
        </a>
        .
      </StyledCopyContainer>
    );
  }

  const links = [
    ...(shouldOfferBypass && !shouldUseBypass
      ? [
          <button key="bypass" type="button" onClick={enableBypass}>
            <Trans>Bypass SSO</Trans>
          </button>,
        ]
      : []),
    ...(isDefined(privacyPolicyUrl)
      ? [
          <a
            key="privacy"
            href={privacyPolicyUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Trans>Privacy Policy</Trans>
          </a>,
        ]
      : []),
    ...(isDefined(termsUrl)
      ? [
          <a
            key="terms"
            href={termsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Trans>Terms of Service</Trans>
          </a>,
        ]
      : []),
  ];

  if (links.length === 0) {
    return null;
  }

  return (
    <StyledLinksContainer>
      {links.map((link, index) => (
        <Fragment key={link.key}>
          {index > 0 && <StyledSeparator>•</StyledSeparator>}
          {link}
        </Fragment>
      ))}
    </StyledLinksContainer>
  );
};
