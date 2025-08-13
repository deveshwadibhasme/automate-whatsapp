const sessionInput = document.querySelector('#session')

async function generateQR() {
  const sessionName = sessionInput.value.trim();
  if (!sessionName) {
    alert('Please enter a session name');
    return;
  }
  await fetch(`http://localhost:5000/generate-qr/${sessionName}`,
  {
    method: 'POST'
  });
  pollQR();
}

async function pollQR() {
  const res = await fetch('http://localhost:5000/qr');
  if (res.status === 202) {
    setTimeout(pollQR, 1000); // try again in 1 sec
  } else {
    const data = await res.json();
    document.getElementById('qr').innerHTML = `<img src="data:image/png;base64,${data.qr}" />`;
  }
}


async function sendMessages() {
    const sessionName = document.getElementById('session').value.trim();
    const nameList = document.getElementById('names').value.trim().split(',').map(n => n.trim());
    const message = document.getElementById('message').value.trim();

    const res = await fetch(`http://localhost:5000/send-messages/${sessionName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameList, message })
    });

    const result = await res.json();
    document.getElementById('response').innerText = JSON.stringify(result, null, 2);
};

