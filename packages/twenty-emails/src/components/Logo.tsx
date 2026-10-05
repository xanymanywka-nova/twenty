import { Img } from 'react-email';
import { PRODUCT_BRAND } from 'twenty-shared/constants';

const logoStyle = {
  marginBottom: '40px',
};

export const Logo = () => {
  return (
    <Img
      src={`${PRODUCT_BRAND.websiteUrl}/brand/nova-mark.svg`}
      alt={`${PRODUCT_BRAND.name} logo`}
      width="40"
      height="40"
      style={logoStyle}
    />
  );
};
