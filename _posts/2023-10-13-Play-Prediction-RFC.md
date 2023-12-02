---
layout: post
title: "Forecasting Football Plays with a Random Forest Classifier"
categories: journal
date: 2023-10-13
tags: ['python']
---

# Background Information

Random forests are a method of ensemble learning for classification, regression, and other tasks that involve decision trees during training time. For ensemble learning, several different predictive models are created to solve a particular problem. The several different models are then combined into a single model with the goal of producing a final robust model using the power of many.

Random forests work by generation many decision trees at random. Once a prediction is made, each decision tree is evaluated based on the inputs. The output of each tree gets counted and the modal outcome is selected as the final prediction. Random forests can be used to output classifications and for regression analysis, making them enticing in many scenarios.

Since play calling is so different between programs, we will be using a specific coach and try to predict based on their historical tendencies. Becuase of this, I will be using Dabo Swinney and the Clemson Tigers. 

# Gathering and Cleaning the data

For this we are using numpy, pandas, and the cfbd libraries.

```python
import numpy as np
import pandas as pd
import requests
import cfbd
from cfbd.rest import ApiException
```

Within the CFBD API, play data appears to be the most suitable as it encompasses all essential details regarding the game situation and conveniently categorizes each play type, such as runs, passes, kickoffs, among others. Specifically, I will go from 2015 to present day.

```python
api_instance = cfbd.PlaysApi(cfbd.ApiClient(configuration))
# List to store the lines data for each year
all_plays = []

for year in range(2015, 2023):
  for week in range(1,15):
    try:
    # Play by play data
      api_response = api_instance.get_plays(year=year, week=week, team='Clemson')
      all_plays.extend(api_response)
    except ApiException as e:
      print("Exception when calling PlaysApi->get_plays: %s\n" % e)
```

I will put this all into a dataframe for ease of use: 

```python 
df = pd.DataFrame([
    dict(
        home = l.home,
        away = l.away,
        offense_score = l.offense_score,
        defense_score = l.defense_score,
        period = l.period,
        clock_minutes = l.clock.minutes,
        clock_seconds = l.clock.seconds,
        yards_to_goal = l.yards_to_goal,
        down = l.down,
        distance = l.distance,
        play_type = l.play_type
        )
    for l in all_plays])
```

![All Plays Dataframe](/images/play_prediction_rfc/all_plays_initial.png)

# Cleanup 

We would like to know when Clemson was home while calling plays, so we calculate a column called is_home. Next we want to calculate the total seconds remaining instead of the minutes and seconds remaining, so we will combine them into one seconds_remaining category.

```python
df['is_home'] = np.where(df['home'] == 'Clemson', 1, 0)

df['seconds_remaining'] = (df['clock_minutes'] * 60) + df['clock_seconds']

```

![All Plays Post Cleanup](images/play_prediction_rfc/after_cleanup.png)

Before constructing our random forest classifier, there's a bit more preparation needed. The 'play_type' field, as it currently stands, is too detailed, outlining both the play's type and outcome (like "Pass Incompletion" or "Rush TD"). We'll refine this to focus solely on the play calls we're interested in: rush, pass, punt, and field goal (FG). I've created a function to categorize plays into these four groups. It's worth noting that some plays, such as kickoffs, timeouts, and penalties, don't fit these categories and will be classified as 'None'. This function should now be run to modify our data frame, adding a new column for the simplified play call classification.

```python
pass_types = ['Pass Reception', 'Pass Interception Return', 'Pass Incompletion', 'Sack', 'Passing Touchdown', 'Interception Return Touchdown']
rush_types = ['Rush', 'Rushing Touchdown']
punt_types = ['Punt', 'Punt Return Touchdown', 'Blocked Punt', 'Blocked Punt Touchdown']
fg_types = ['Field Goal Good', 'Field Goal Missed', 'Blocked Field Goal']

def getPlayCall(x):
    if x in pass_types:
            return 'pass'
    elif x in rush_types:
        return 'rush'
    elif x in punt_types:
        return 'punt'
    elif x in fg_types:
        return 'fg'
    else:
        return None

df['play_call'] = df['play_type'].apply(getPlayCall)
```

What should we do with play types that don't align with our four main play call categories? For the purposes of this project, these plays are irrelevant. Recall that we assigned a 'None' value to these types of plays. Fortunately, Pandas provides a handy function to eliminate rows with missing values. We can even specify which columns to consider when deciding which rows to remove. To clean our data and keep it focused on our study's scope, execute the following code to discard these irrelevant rows.


```python
df.dropna(subset=['play_call'], inplace=True)
```

Let's eliminate any unnecessary columns, specifically those used solely for deriving new columns. To preserve these columns for potential future adjustments, I'll transfer the current data frame into a new variable. This step ensures that we retain access to the original data for any further modifications.

```python
plays = df[['offense_score', 'defense_score', 'period', 'yards_to_goal', 'down', 'distance', 'is_home', 'seconds_remaining', 'play_call']]
```

![Final All Plays Dataframe](/images/play_prediction_rfc/final_all_plays.png)

# Building the Prediction Model

To set up our prediction model, we will import two  modules from the scikit-learn library. The initial module facilitates the division of data into training and validation sets, a process we'll delve into shortly. The second module is pivotal for constructing random forest classifiers, serving as the core of our model-building endeavor.

```python 
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
```

We're now going to organize our data to better suit our model's development. Initially, we'll differentiate between our features (independent variables) and the desired output (dependent variable) of our model. The features will contain various game situation inputs, while the model aims to predict play calls, our dependent variable. Next, we'll divide the data into training and validation subsets. Employing the train_test_split module, previously imported, we'll allocate 20% of our data as the validation set, ensuring we have a robust framework for testing and refining our model.

```python 
# split the data set between our independent variables (i.e. features) and our dependent variable or output
play_calls = plays['play_call']
plays = plays.drop(['play_call'], axis=1)

# split the data into training and validation sets
plays_train, plays_validation, calls_train, calls_validation = train_test_split(plays, play_calls, train_size=0.8, test_size=0.2, random_state=0)
plays_train.head()
```

![Training feature set](images/play_prediction_rfc/training_feature_set.png)

When training, it is best to have all data in numerical format. While the feature set is, the dependent set of play calls is not. To convert this categorical data into numerical data, we use pd.factorize. 

The factorize method returns two sets, one contained the data as a set of numbers ranging from 0 to 3 and other containing the key mappings telling us which number mapped to which label. We can now build and train the random forest classifier.

Note that we passed in both of our set of features as well as the set of corresponding outputs in numeric format. The validation set of features can be passed through at this point.

```python
# convert the categorical data into numerical data
y, y_keys = pd.factorize(calls_train)
# build the classifier
classifier = RandomForestClassifier(random_state=0, n_estimators=100)
#train the classifier with our test set
classifier.fit(plays_train, y)
# pass validation set of features and see what classifier outputs
classifier.predict(plays_validation)
```

This outputs the raw inputs, so they still need to be converted into labels using the *y_keys* mapping object created earlier. Before doing this, *predict_proba* within the scikit-learn library provides a greater level of granularity by outputting the probabilities within each set of inputs. There are four probabilities for each set of inputs which correspond to our four different output labels (pass/rush/fg/punt).

```python
classifier.predict_proba(plays_validation)[0:10]
```
![predict_proba](images/play_prediction_rfc/predict_proba.png)

To map our original set of outputs to our category labels, this can be done:

```python
predicted_calls = y_keys[classifier.predict(plays_validation)]
predicted_calls
```

This is not useful until the vau

