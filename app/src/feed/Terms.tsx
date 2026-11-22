import { useState } from 'react'
import { Popup } from './Popup'

// "Terms of Service" link at the bottom of your Profile tab; opens the terms in a pop-up.
export function TermsLink() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="link-btn terms-link" onClick={() => setOpen(true)}>
        Terms of Service
      </button>
      {open && (
        <Popup title="Terms of Service" onClose={() => setOpen(false)}>
          <div className="terms">
            <p className="terms-date">Last updated 22 November 2026</p>
            <p>By using getSendy! you agree to these terms. If you don't, please don't use the app.</p>

            <h3>Who can use it</h3>
            <ul>
              <li>You must be 18 or older.</li>
            </ul>

            <h3>No alcohol</h3>
            <ul>
              <li>
                getSendy! is for non-alcoholic drinks only. Don't chug beer or any alcoholic drink: drinking alcohol
                fast can cause alcohol poisoning, which can kill.
              </li>
              <li>Posts showing alcohol may be removed.</li>
            </ul>

            <h3>Pace yourself</h3>
            <ul>
              <li>
                Don't post more than <b>1 chug an hour</b> or <b>3 chugs a day</b>.
              </li>
              <li>
                Energy drinks are high in caffeine (a Celsius has about 200 mg). Keep it to about <b>2 a day</b>: adults
                should stay under 400 mg of caffeine a day.
              </li>
              <li>
                Skip caffeinated drinks if you're pregnant, sensitive to caffeine, or have a heart condition.
              </li>
            </ul>

            <h3>Chug safely</h3>
            <ul>
              <li>Drinking fast can cause choking, cramps or vomiting. Stop if you feel unwell.</li>
              <li>Opened cans have sharp edges: open them carefully and never with your teeth.</li>
              <li>You take part at your own risk and are responsible for your own safety.</li>
            </ul>

            <h3>Your posts are public</h3>
            <ul>
              <li>
                When you post a chug, its video, time, username and photo are <b>public</b>: anyone can watch, rate,
                comment on and share them. By posting, you consent to that.
              </li>
              <li>Only post videos of yourself, or of people who agreed to be filmed and posted. Never post minors.</li>
              <li>You can delete your posts or your whole account at any time from your Profile.</li>
            </ul>

            <h3>Camera and microphone</h3>
            <ul>
              <li>
                The camera and mic are analysed on your phone only. Nothing is uploaded unless you post a run, and
                then only its replay video.
              </li>
            </ul>

            <h3>Be decent</h3>
            <ul>
              <li>No nudity, hate, harassment or dangerous stunts. We may remove posts or accounts that break these terms.</li>
            </ul>

            <h3>The small print</h3>
            <ul>
              <li>Times are measured automatically and can be off. The leaderboard is just for fun.</li>
              <li>getSendy! is a student hackathon project, provided as is, with no guarantees.</li>
              <li>These terms may change. Using the app after a change means you accept the new terms.</li>
            </ul>
          </div>
        </Popup>
      )}
    </>
  )
}
