import { Link } from 'react-router-dom'
import fernMark from '../../assets/fern-mark.svg'

// "fearne." set in Gabarito 800, full stop in the accent colour, the fern
// mark to the left of the wordmark. Never given to Onest, never redrawn.
export default function Wordmark({ onFeature, as, className = '', ...rest }) {
  const As = as || Link
  const linkProps = As === Link ? { to: '/' } : {}
  const classes = ['fh-wordmark', onFeature ? 'fh-wordmark--onFeature' : '', className]
    .filter(Boolean)
    .join(' ')
  // A mask (not <img>) so the mark picks up `color: currentColor` like the
  // rest of the lockup, instead of rendering as a flat-black bitmap.
  const maskStyle = {
    backgroundColor: 'currentColor',
    WebkitMaskImage: `url(${fernMark})`,
    maskImage: `url(${fernMark})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  }
  return (
    <As className={classes} {...linkProps} {...rest}>
      <span className="fh-wordmark__mark" style={maskStyle} aria-hidden="true" />
      <span>fearne.</span>
    </As>
  )
}
