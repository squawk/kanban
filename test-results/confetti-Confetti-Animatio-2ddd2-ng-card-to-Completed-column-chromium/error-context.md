# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img "Fidello - Leveraging Human Performance" [ref=e8]
        - generic [ref=e9]: Support Tickets
      - link "Login" [ref=e10] [cursor=pointer]:
        - /url: /login
  - main [ref=e11]:
    - generic [ref=e12]:
      - heading "Submit a Support Ticket" [level=1] [ref=e13]
      - paragraph [ref=e14]: Please fill out the form below and we'll get back to you as soon as possible.
      - generic [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Your Name*
          - textbox "Your Name*" [ref=e18]:
            - /placeholder: John Doe
        - generic [ref=e19]:
          - generic [ref=e20]: Your Email*
          - textbox "Your Email*" [ref=e21]:
            - /placeholder: john@example.com
        - generic [ref=e22]:
          - generic [ref=e23]: Company*
          - combobox "Company*" [ref=e24]:
            - option "Select a company" [selected]
            - option "Fidello, Inc."
        - generic [ref=e25]:
          - generic [ref=e26]: Subject*
          - textbox "Subject*" [ref=e27]:
            - /placeholder: Brief description of your issue
        - generic [ref=e28]:
          - generic [ref=e29]: Description
          - textbox "Description" [ref=e30]:
            - /placeholder: Please provide detailed information about your issue
          - paragraph [ref=e31]: Minimum 10 characters
        - button "Submit Ticket" [ref=e32] [cursor=pointer]
```